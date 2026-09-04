import { describe, it, expect, vi, beforeEach } from "vitest";
import { EventEmitter } from "node:events";

// safe-fetch reaches the network two ways: a DNS lookup it does itself, and
// the http(s) request it pins to the address that lookup returned. Both are
// mocked here so the SSRF rules can be exercised against addresses no test
// environment would actually resolve to -- the point of these tests is which
// addresses get refused, which is a decision made entirely before any socket
// would open.
const lookup = vi.fn();
const httpRequest = vi.fn();
const httpsRequest = vi.fn();

vi.mock("node:dns", () => ({ default: { promises: { lookup: (...a: unknown[]) => lookup(...a) } } }));
vi.mock("node:http", () => ({ default: { request: (...a: unknown[]) => httpRequest(...a) } }));
vi.mock("node:https", () => ({ default: { request: (...a: unknown[]) => httpsRequest(...a) } }));

const { fetchUrlSafely, UnsafeUrlError } = await import("./safe-fetch");

type Scripted = { status?: number; location?: string; body?: string };

// Each entry is consumed by one request; the queue lets a redirect chain be
// scripted hop by hop.
let responses: Scripted[] = [];
// Every options object safe-fetch handed to http(s).request, so a test can
// assert which IP the socket was actually pinned to.
let requestOptions: any[] = [];

function fakeRequest(options: any, cb: (res: any) => void) {
  requestOptions.push(options);
  const req: any = new EventEmitter();
  req.end = () => {
    const scripted = responses.shift() ?? { status: 200, body: "" };
    const res: any = new EventEmitter();
    res.statusCode = scripted.status ?? 200;
    res.headers = scripted.location ? { location: scripted.location } : {};
    res.resume = () => {};
    setImmediate(() => {
      cb(res);
      setImmediate(() => {
        if (!scripted.location) {
          if (scripted.body) res.emit("data", Buffer.from(scripted.body, "utf-8"));
          res.emit("end");
        }
      });
    });
  };
  req.destroy = () => {};
  return req;
}

beforeEach(() => {
  vi.clearAllMocks();
  responses = [];
  requestOptions = [];
  httpRequest.mockImplementation(fakeRequest);
  httpsRequest.mockImplementation(fakeRequest);
  lookup.mockResolvedValue({ address: "93.184.216.34" });
});

describe("scheme allowlist", () => {
  for (const url of ["file:///etc/passwd", "gopher://example.com/", "ftp://example.com/x", "data:text/html,hi"]) {
    it(`refuses ${url}`, async () => {
      await expect(fetchUrlSafely(url)).rejects.toThrow(UnsafeUrlError);
      expect(lookup).not.toHaveBeenCalled();
    });
  }

  it("allows plain http and https", async () => {
    responses = [{ status: 200, body: "<p>ok</p>" }];
    await expect(fetchUrlSafely("http://example.com/a")).resolves.toBe("ok");
    responses = [{ status: 200, body: "<p>ok</p>" }];
    await expect(fetchUrlSafely("https://example.com/a")).resolves.toBe("ok");
  });
});

describe("private and reserved address ranges", () => {
  const blocked = [
    ["loopback", "127.0.0.1"],
    ["loopback, non-.1", "127.255.255.254"],
    ["this-network", "0.0.0.0"],
    ["RFC1918 /8", "10.1.2.3"],
    ["RFC1918 /12 low", "172.16.0.1"],
    ["RFC1918 /12 high", "172.31.255.254"],
    ["RFC1918 /16", "192.168.1.1"],
    ["carrier-grade NAT", "100.64.0.1"],
    ["link-local / cloud metadata", "169.254.169.254"],
    ["IETF protocol assignments", "192.0.0.1"],
    ["TEST-NET-1", "192.0.2.5"],
    ["benchmarking", "198.18.0.1"],
    ["TEST-NET-2", "198.51.100.5"],
    ["TEST-NET-3", "203.0.113.5"],
    ["multicast", "224.0.0.1"],
    ["reserved", "255.255.255.255"],
  ] as const;

  for (const [label, ip] of blocked) {
    it(`refuses a host resolving to ${label} (${ip})`, async () => {
      lookup.mockResolvedValue({ address: ip });
      await expect(fetchUrlSafely("http://rebind.example.com/")).rejects.toThrow(UnsafeUrlError);
      expect(httpRequest).not.toHaveBeenCalled();
    });
  }

  const allowed = ["93.184.216.34", "8.8.8.8", "172.15.255.255", "172.32.0.1", "100.63.255.255", "1.1.1.1"];
  for (const ip of allowed) {
    it(`allows a host resolving to public ${ip}`, async () => {
      lookup.mockResolvedValue({ address: ip });
      responses = [{ status: 200, body: "fine" }];
      await expect(fetchUrlSafely("http://example.com/")).resolves.toBe("fine");
    });
  }
});

describe("IPv6 literals and mapped addresses", () => {
  const blocked = [
    ["IPv6 loopback", "::1"],
    ["unspecified", "::"],
    ["link-local", "fe80::1"],
    ["link-local, upper case", "FE80::1"],
    ["link-local high end of /10", "feb0::1"],
    ["unique local fc00::/8", "fc00::1"],
    ["unique local fd00::/8", "fd12:3456::1"],
    ["IPv4-mapped loopback", "::ffff:127.0.0.1"],
    ["IPv4-mapped RFC1918", "::ffff:192.168.0.1"],
    ["IPv4-mapped metadata", "::ffff:169.254.169.254"],
  ] as const;

  for (const [label, ip] of blocked) {
    it(`refuses ${label} (${ip})`, async () => {
      lookup.mockResolvedValue({ address: ip });
      await expect(fetchUrlSafely("http://v6.example.com/")).rejects.toThrow(UnsafeUrlError);
    });
  }

  it("allows a public IPv6 address", async () => {
    lookup.mockResolvedValue({ address: "2606:2800:220:1:248:1893:25c8:1946" });
    responses = [{ status: 200, body: "v6" }];
    await expect(fetchUrlSafely("http://v6.example.com/")).resolves.toBe("v6");
  });

  it("allows a public IPv4-mapped address", async () => {
    lookup.mockResolvedValue({ address: "::ffff:93.184.216.34" });
    responses = [{ status: 200, body: "mapped" }];
    await expect(fetchUrlSafely("http://v6.example.com/")).resolves.toBe("mapped");
  });

  it("refuses anything DNS returns that is not a parsable IP at all", async () => {
    lookup.mockResolvedValue({ address: "not-an-ip" });
    await expect(fetchUrlSafely("http://example.com/")).rejects.toThrow(UnsafeUrlError);
  });

  it("refuses a hostname that does not resolve", async () => {
    lookup.mockRejectedValue(new Error("ENOTFOUND"));
    await expect(fetchUrlSafely("http://nope.example.com/")).rejects.toThrow(/Could not resolve/);
  });
});

describe("credentials, ports, and odd URL shapes", () => {
  it("resolves the real hostname, not the userinfo part, when credentials are embedded", async () => {
    lookup.mockResolvedValue({ address: "93.184.216.34" });
    responses = [{ status: 200, body: "ok" }];
    await fetchUrlSafely("http://127.0.0.1:80@example.com/");
    expect(lookup).toHaveBeenCalledWith("example.com");
  });

  it("still refuses when the host after the credentials is internal", async () => {
    lookup.mockResolvedValue({ address: "127.0.0.1" });
    await expect(fetchUrlSafely("http://user:pass@localhost/")).rejects.toThrow(UnsafeUrlError);
  });

  it("rejects a protocol-relative URL, which has no scheme to allow", async () => {
    await expect(fetchUrlSafely("//example.com/x")).rejects.toThrow();
    expect(lookup).not.toHaveBeenCalled();
  });

  it("keeps a non-default port rather than silently normalizing it away", async () => {
    responses = [{ status: 200, body: "ok" }];
    await fetchUrlSafely("http://example.com:8080/a?b=c");
    expect(requestOptions[0].port).toBe("8080");
    expect(requestOptions[0].path).toBe("/a?b=c");
  });

  it("pins the socket to the validated address while leaving the hostname for SNI and Host", async () => {
    lookup.mockResolvedValue({ address: "93.184.216.34" });
    responses = [{ status: 200, body: "ok" }];
    await fetchUrlSafely("https://example.com/");
    expect(requestOptions[0].hostname).toBe("example.com");
    const pinned = await new Promise<string>((resolve) =>
      requestOptions[0].lookup("example.com", {}, (_e: null, address: string) => resolve(address)),
    );
    expect(pinned).toBe("93.184.216.34");
  });
});

describe("redirects", () => {
  it("re-validates each hop rather than trusting the first one", async () => {
    responses = [{ status: 302, location: "http://internal.example.com/" }];
    lookup.mockResolvedValueOnce({ address: "93.184.216.34" }).mockResolvedValueOnce({ address: "169.254.169.254" });
    await expect(fetchUrlSafely("http://example.com/")).rejects.toThrow(/internal\/private/);
  });

  it("resolves a relative Location against the hop it came from", async () => {
    responses = [{ status: 301, location: "/moved" }, { status: 200, body: "landed" }];
    await expect(fetchUrlSafely("http://example.com/start")).resolves.toBe("landed");
    expect(requestOptions[1].path).toBe("/moved");
  });

  it("follows up to three redirects", async () => {
    responses = [
      { status: 302, location: "http://example.com/1" },
      { status: 302, location: "http://example.com/2" },
      { status: 302, location: "http://example.com/3" },
      { status: 200, body: "end" },
    ];
    await expect(fetchUrlSafely("http://example.com/0")).resolves.toBe("end");
  });

  it("gives up on the fourth redirect", async () => {
    responses = Array.from({ length: 5 }, (_, i) => ({ status: 302, location: `http://example.com/${i + 1}` }));
    await expect(fetchUrlSafely("http://example.com/0")).rejects.toThrow(/Too many redirects/);
  });

  it("does not follow a 3xx that carries no Location header", async () => {
    responses = [{ status: 304, body: "" }];
    await expect(fetchUrlSafely("http://example.com/")).resolves.toBe("");
    expect(requestOptions).toHaveLength(1);
  });
});

describe("response handling", () => {
  it("turns a 4xx into an error rather than returning the error page's text", async () => {
    responses = [{ status: 404, body: "<p>gone</p>" }];
    await expect(fetchUrlSafely("http://example.com/")).rejects.toThrow(/returned an error \(404\)/);
  });

  it("turns a 5xx into an error", async () => {
    responses = [{ status: 503, body: "" }];
    await expect(fetchUrlSafely("http://example.com/")).rejects.toThrow(/returned an error \(503\)/);
  });
});

describe("readable-text extraction", () => {
  async function textOf(html: string): Promise<string> {
    responses = [{ status: 200, body: html }];
    return fetchUrlSafely("http://example.com/");
  }

  it("strips script content, including a closing tag carrying attributes", async () => {
    expect(await textOf("<p>a</p><script>steal()</script foo=\"bar\"><p>b</p>")).toBe("a b");
  });

  it("strips a closing script tag separated by whitespace and junk", async () => {
    expect(await textOf("<p>a</p><script>steal()</script\t\n bar><p>b</p>")).toBe("a b");
  });

  it("strips style blocks and HTML comments", async () => {
    expect(await textOf("<style>p{color:red}</style><!-- hidden -->visible")).toBe("visible");
  });

  it("unescapes &amp; last so a double-encoded entity stays literal", async () => {
    expect(await textOf("&amp;lt;script&amp;gt;")).toBe("&lt;script&gt;");
  });

  it("unescapes single-encoded entities normally", async () => {
    expect(await textOf("&lt;b&gt; &quot;x&quot; &#39;y&#39; a&amp;b")).toBe('<b> "x" \'y\' a&b');
  });

  it("collapses whitespace and trims", async () => {
    expect(await textOf("  <div>\n  a   \t b\n</div>  ")).toBe("a b");
  });

  it("truncates a very long page to the prompt-sized cap", async () => {
    expect((await textOf("x".repeat(50000))).length).toBe(20000);
  });
});
