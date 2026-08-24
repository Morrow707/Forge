import { QueryCache, QueryClient, QueryFunction, type Query } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { Capacitor } from "@capacitor/core";

// The web deployment serves the frontend and backend from the same origin,
// so a relative "/api/..." path resolves correctly there on its own. A
// native build has no such origin: the WKWebView/WebView loads the bundled
// app shell from capacitor://localhost (iOS) or https://localhost
// (Android), never the real server, so the exact same relative path
// silently resolves against that local origin instead -- fetch still
// "succeeds" against Capacitor's own scheme handler, just against the
// wrong thing, and the caller ends up trying to JSON-parse whatever that
// handler returned. This was the actual cause of every "The string did not
// match the expected pattern." failure on native, not anything
// form/validation-related -- see login.tsx's noValidate comment, which
// was chasing the wrong theory before this was found.
const NATIVE_API_BASE_URL = "https://forge-ebhd.onrender.com";

/** Resolves a same-origin-relative path ("/api/...", "/uploads/...") to an
 * absolute URL on native platforms; passes web/already-absolute URLs
 * through untouched. Every fetch()/sendBeacon() call against this app's own
 * backend -- not just the ones routed through apiRequest/getQueryFn below --
 * needs to go through this, including the keepalive tab-close saves in
 * workout.tsx/class-builder.tsx and share-file.ts's export fetch. */
export function resolveApiUrl(url: string): string {
  if (!Capacitor.isNativePlatform()) return url;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(url)) return url;
  return `${NATIVE_API_BASE_URL}${url}`;
}

// Fallback auth for native: iOS's WKWebView drops the cross-origin session
// cookie (Apple ITP treats the real backend as third-party relative to
// capacitor://localhost), so login/signup also hand back a signed bearer
// token (see server/auth.ts) that's replayed as an Authorization header on
// every subsequent native request instead. No-op on web, which never gets a
// token in the first place and keeps using the cookie exactly as before.
const NATIVE_TOKEN_KEY = "forge-native-token";

export function getNativeToken(): string | null {
  if (!Capacitor.isNativePlatform()) return null;
  return window.localStorage.getItem(NATIVE_TOKEN_KEY);
}

export function setNativeToken(token: string | null | undefined): void {
  if (!Capacitor.isNativePlatform()) return;
  if (token) window.localStorage.setItem(NATIVE_TOKEN_KEY, token);
  else window.localStorage.removeItem(NATIVE_TOKEN_KEY);
}

function authHeaders(): Record<string, string> {
  const token = getNativeToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = await res.json();
      if (data?.message) message = data.message;
    } catch {
      // ignore body parse failure
    }
    throw new ApiError(res.status, message);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  body?: unknown,
): Promise<Response> {
  // FormData (file uploads) must go through untouched -- JSON.stringify-ing
  // it just serializes an empty object, and the browser needs to set its
  // own multipart Content-Type (with boundary) rather than the JSON one.
  const isFormData = body instanceof FormData;
  let res: Response;
  try {
    res = await fetch(resolveApiUrl(url), {
      method,
      headers: {
        ...(body && !isFormData ? { "Content-Type": "application/json" } : {}),
        ...authHeaders(),
      },
      body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch (err) {
    // Surfacing the raw fetch()-level failure (name + message + which
    // request) instead of letting it bubble up as-is.
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new Error(`Request failed (${method} ${url}): ${detail}`);
  }
  await throwIfResNotOk(res);
  return res;
}

/** Like apiRequest for a FormData POST, but reports upload progress via
 * onProgress(fraction) -- fetch() has no way to observe request-body
 * upload progress (streaming request bodies still isn't reliably
 * supported across target browsers/WebKit), only XMLHttpRequest's
 * upload.onprogress does, so this is a separate path rather than a
 * fetch()-based trick. Used by upload flows whose payload (a video clip)
 * is large enough on a slow connection that a bare "Saving..." with no
 * percentage reads as hung. */
export function uploadWithProgress(
  url: string,
  formData: FormData,
  onProgress?: (fraction: number) => void,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", resolveApiUrl(url));
    xhr.withCredentials = true;
    const token = getNativeToken();
    if (token) xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      let data: any = null;
      try {
        data = xhr.responseText ? JSON.parse(xhr.responseText) : null;
      } catch {
        // Matches throwIfResNotOk's own "ignore body parse failure" --
        // an empty/non-JSON body on a non-2xx response just falls back
        // to statusText below.
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
      } else {
        reject(new ApiError(xhr.status, data?.message || xhr.statusText || "Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error(`Request failed (POST ${url}): network error`));
    xhr.send(formData);
  });
}

// Shorthand for the "GET a URL, parse JSON" queryFn every manually-keyed
// query in the app was copy-pasting inline -- use this instead of writing
// out `async () => { const res = await apiRequest("GET", url); return
// res.json(); }` again. Not needed for queries that just pass a bare
// queryKey with no explicit queryFn; those already go through getQueryFn.
export async function getJson(url: string) {
  const res = await apiRequest("GET", url);
  return res.json();
}

export const getQueryFn: <T>(options?: {
  on401?: "returnNull";
}) => QueryFunction<T> =
  (options = {}) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    let res: Response;
    try {
      res = await fetch(resolveApiUrl(url), { credentials: "include", headers: authHeaders() });
    } catch (err) {
      const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
      throw new Error(`Request failed (GET ${url}): ${detail}`);
    }

    if (options.on401 === "returnNull" && res.status === 401) {
      return null as any;
    }

    await throwIfResNotOk(res);
    return res.json();
  };

// Only useAuth's own "/api/auth/me" check wants a 401 treated as the valid,
// expected answer "no one is logged in" -- every other query in the app is
// already gated behind ProtectedRoute and expects to be authenticated, so a
// 401 there means something's genuinely wrong (session expired, or a
// request raced ahead of a fresh login) and should surface as a query error
// like any other failure, not silently resolve to null. Returning null from
// the default queryFn broke that: callers destructuring `data: x = []` only
// get the default for `undefined`, not `null`, so a raced 401 crashed
// downstream code that assumed an array.
// Safety net for native specifically: if a query still fails after the
// token-auth fix above, data ?? [] fallbacks throughout the app render that
// identically to genuinely empty data -- there's no console to check on an
// iPhone-only device, so surface the FIRST such failure directly rather than
// let it hide silently again. Fires at most once per app launch, and skips
// auth/me's own 401 (the normal, expected "not logged in yet" case).
let hasAlertedQueryFailure = false;
function alertOnFirstQueryFailure(error: unknown, queryKey: readonly unknown[]) {
  if (!Capacitor.isNativePlatform() || hasAlertedQueryFailure) return;
  if (queryKey[0] === "/api/auth/me") return;
  hasAlertedQueryFailure = true;
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  window.alert(`Data request failed\n${JSON.stringify(queryKey)}\n${detail}`);
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error, query) => alertOnFirstQueryFailure(error, query.queryKey),
  }),
  defaultOptions: {
    queries: {
      queryFn: getQueryFn(),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

// Native-app twin of the day-cache/pending-log persistence offline-queue.ts
// already does for the workout page specifically -- this covers everything
// else React Query fetches (calendar, programs, exercise bank, roster, class
// content...) so reopening the app offline, or on a slow connection, paints
// the last-known screen immediately instead of a loading spinner or blank
// state, with a real fetch still kicked off underneath per each query's own
// staleTime. localStorage (not IndexedDB) is enough here: query results are
// JSON metadata, not the media itself, so the volume is small.
export const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: "forge-query-cache",
});

export const persistOptions = {
  persister,
  // Beyond this, cached data is more likely to actively mislead (a
  // schedule/roster/program from yesterday shown as if current) than help --
  // better to fall back to a loading state and fetch fresh.
  maxAge: 24 * 60 * 60 * 1000,
  // Bump this string on any change to what a cached query's data actually
  // looks like -- restoring an old shape into new code is a worse bug than
  // just refetching, and this is the one signal that forces that instead of
  // silently trying to use it.
  buster: "v1",
  dehydrateOptions: {
    // "/api/auth/me" never gets written to localStorage in the first
    // place -- the flush this persister does on every query update is
    // throttled (~1s), so a hard reload/cold launch landing inside that
    // window restored whatever snapshot was last flushed, which could
    // still be the pre-login "not authenticated" one even though the
    // login that just succeeded is a moment old. useIsRestoring() (see
    // use-auth.tsx) only guards the restore itself, not whether the
    // thing being restored is stale, so within staleTime that wrong
    // snapshot read as confirmed-logged-out and bounced a genuinely
    // logged-in user to /login. Excluding this one query keeps every
    // reload/cold-launch asking the server fresh -- one cheap GET, and
    // the one query in the app where "instant paint from a maybe-stale
    // cache" is worse than the loading spinner it would otherwise skip.
    shouldDehydrateQuery: (query: Query) =>
      query.queryKey[0] !== "/api/auth/me" && query.state.status === "success",
  },
};
