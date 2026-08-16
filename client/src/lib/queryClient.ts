import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
    res = await fetch(url, {
      method,
      headers: body && !isFormData ? { "Content-Type": "application/json" } : {},
      body: isFormData ? (body as FormData) : body ? JSON.stringify(body) : undefined,
      credentials: "include",
    });
  } catch (err) {
    // Surfacing the raw fetch()-level failure (name + message + which
    // request) instead of letting it bubble up as-is -- on native iOS a
    // failed fetch throws a bare TypeError with WebKit's generic message
    // ("The string did not match the expected pattern."), which gives no
    // hint of *what* about the request WebKit rejected.
    const detail = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    throw new Error(`Request failed (${method} ${url}): ${detail}`);
  }
  await throwIfResNotOk(res);
  return res;
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
      res = await fetch(url, { credentials: "include" });
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
export const queryClient = new QueryClient({
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
