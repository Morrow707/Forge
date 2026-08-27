import { apiRequest } from "@/lib/queryClient";

/** Sends a native AR tracker's on-device diagLog buffer to the admin-only
 * AI diagnosis endpoint (server/storage.ts's diagnoseTrackerLog) and
 * returns its plain-English read on it. Built after a real on-device blur
 * investigation that took many manual rounds -- the point is a future
 * report against this same camera pipeline gets an AI read grounded in
 * that investigation's findings immediately, without waiting on another
 * back-and-forth. Throws ApiError on failure (403 for a non-admin caller,
 * since the route is gated server-side) -- callers should catch and show
 * that message rather than swallow it. */
export async function diagnoseTrackerLog(logLines: string[]): Promise<string> {
  const res = await apiRequest("POST", "/api/admin/diagnose-tracker-log", {
    log: logLines.join("\n"),
  });
  const data = await res.json();
  return data.diagnosis as string;
}
