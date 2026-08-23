import dns from "node:dns";
import net from "node:net";
import https from "node:https";
import http from "node:http";

// Nothing else in this codebase fetches an arbitrary, user-supplied URL --
// every other outbound request goes to a hardcoded trusted host (Anthropic,
// food databases, email) -- so there was no existing safe-fetch pattern to
// reuse for Forge AI's URL-teaching tool. Three layers, in order:
//
// 1. Scheme allowlist (http/https only -- no file:, no gopher:, etc).
// 2. Resolve the hostname ourselves via DNS and reject if the resolved IP
//    falls in any private/loopback/link-local/reserved range -- this is
//    what stops "http://localhost/", "http://169.254.169.254/" (cloud
//    metadata endpoints), and internal-network addresses.
// 3. Pin the actual HTTP(S) connection to that SAME already-validated IP
//    (via a custom `lookup` passed to http(s).request, not by letting the
//    request resolve the hostname a second time on its own) -- without
//    this, a DNS answer that changes between the check above and the real
//    connection (DNS rebinding) would defeat step 2 entirely. TLS SNI and
//    the Host header still use the original hostname, so certificate
//    validation is unaffected -- only which physical address the socket
//    opens to is pinned.
//
// Redirects are never auto-followed by the HTTP client -- a malicious
// server could otherwise 302 a validated public URL straight at an
// internal address, bypassing all of the above. Each hop this follows
// goes through the exact same validation as the original URL, with a
// fixed budget.

const BLOCKED_V4_RANGES: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16], // includes the AWS/GCP/Azure metadata address
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

function ipv4ToInt(ip: string): number {
  return ip.split(".").reduce((acc, octet) => (acc << 8) + Number(octet), 0) >>> 0;
}

function isBlockedV4(ip: string): boolean {
  const ipInt = ipv4ToInt(ip);
  return BLOCKED_V4_RANGES.some(([base, bits]) => {
    const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
    return (ipInt & mask) === (ipv4ToInt(base) & mask);
  });
}

function isBlockedV6(ip: string): boolean {
  const n = ip.toLowerCase();
  if (n === "::1" || n === "::") return true;
  if (/^fe[89ab]/.test(n)) return true; // link-local, fe80::/10
  if (/^f[cd]/.test(n)) return true; // unique local, fc00::/7
  const mapped = n.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isBlockedV4(mapped[1]);
  return false;
}

function isBlockedIp(ip: string): boolean {
  if (net.isIPv4(ip)) return isBlockedV4(ip);
  if (net.isIPv6(ip)) return isBlockedV6(ip);
  return true; // not a recognizable IP at all -- refuse rather than guess
}

export class UnsafeUrlError extends Error {}

const MAX_REDIRECTS = 3;
const MAX_BODY_BYTES = 3_000_000; // 3MB -- plenty for an article's HTML
const FETCH_TIMEOUT_MS = 8000;
const MAX_TEXT_CHARS = 20000;

async function resolveValidatedIp(hostname: string): Promise<string> {
  let result: { address: string };
  try {
    result = await dns.promises.lookup(hostname);
  } catch {
    throw new UnsafeUrlError("Could not resolve that address");
  }
  if (isBlockedIp(result.address)) {
    throw new UnsafeUrlError("That address points somewhere internal/private and can't be fetched");
  }
  return result.address;
}

function fetchOnce(urlStr: string): Promise<{ status: number; location?: string; body: string }> {
  const url = new URL(urlStr);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return Promise.reject(new UnsafeUrlError("Only http/https URLs are supported"));
  }
  return resolveValidatedIp(url.hostname).then(
    (address) =>
      new Promise((resolve, reject) => {
        const client = url.protocol === "https:" ? https : http;
        const req = client.request(
          {
            hostname: url.hostname,
            // Pins the socket to the already-validated IP -- see file comment.
            lookup: (_hostname: string, _options: unknown, callback: (err: null, address: string, family: number) => void) =>
              callback(null, address, net.isIPv6(address) ? 6 : 4),
            port: url.port || (url.protocol === "https:" ? 443 : 80),
            path: url.pathname + url.search,
            method: "GET",
            headers: { "User-Agent": "ForgeAI/1.0 (+admin-taught-content-fetch)" },
            timeout: FETCH_TIMEOUT_MS,
          },
          (res) => {
            const status = res.statusCode ?? 0;
            if (status >= 300 && status < 400 && res.headers.location) {
              res.resume();
              resolve({ status, location: new URL(res.headers.location, url).toString(), body: "" });
              return;
            }
            const chunks: Buffer[] = [];
            let total = 0;
            res.on("data", (chunk: Buffer) => {
              total += chunk.length;
              if (total > MAX_BODY_BYTES) {
                req.destroy();
                reject(new UnsafeUrlError("That page is too large to read"));
                return;
              }
              chunks.push(chunk);
            });
            res.on("end", () => resolve({ status, body: Buffer.concat(chunks).toString("utf-8") }));
          },
        );
        req.on("timeout", () => req.destroy(new UnsafeUrlError("Timed out fetching that page")));
        req.on("error", (err) =>
          reject(err instanceof UnsafeUrlError ? err : new UnsafeUrlError(`Couldn't fetch that page: ${err.message}`)),
        );
        req.end();
      }),
  );
}

function extractReadableText(html: string): string {
  const text = html
    // \s* before the closing '>' -- real browsers still treat
    // "</script >" (or any whitespace before the bracket) as a valid
    // closing tag, so a plain "</script>" literal here would leave that
    // variant's actual script content sitting in what's supposed to be
    // stripped, plain-text HTML handed to an LLM prompt.
    .replace(/<script[\s\S]*?<\/script\s*>/gi, " ")
    .replace(/<style[\s\S]*?<\/style\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    // &amp; unescapes last, not first -- it has to run after &lt;/&gt;/
    // &quot;/&#39; or a double-encoded literal like "&amp;lt;" (meant to
    // display as the literal text "&lt;") gets unescaped twice: the &amp;
    // pass alone turns it into "&lt;", which is already correct, but
    // running the &lt; replace afterward would incorrectly turn that into
    // a bare "<". Doing &amp; last means &lt;/&gt;/etc. only ever see
    // single-encoded entities, exactly as originally written.
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
  return text.slice(0, MAX_TEXT_CHARS);
}

/** Fetches an admin-pasted URL for the Forge AI teaching chat, with SSRF
 * protection (see file comment) and a fixed redirect budget where every
 * hop is independently re-validated. Returns readable text, HTML markup
 * stripped, truncated to a length reasonable to hand to an LLM prompt. */
export async function fetchUrlSafely(urlStr: string): Promise<string> {
  let current = urlStr;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const result = await fetchOnce(current);
    if (result.location) {
      if (i === MAX_REDIRECTS) throw new UnsafeUrlError("Too many redirects");
      current = result.location;
      continue;
    }
    if (result.status >= 400) throw new UnsafeUrlError(`That page returned an error (${result.status})`);
    return extractReadableText(result.body);
  }
  throw new UnsafeUrlError("Too many redirects");
}
