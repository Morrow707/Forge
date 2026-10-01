import type { Request } from "express";
import { PUBLIC_ORIGIN } from "@shared/public-origin";

/** The absolute origin for a link that leaves the app in an email.
 *
 * PUBLIC_ORIGIN (the Render variable) first: once forgeperformancesystems.com answers, every
 * emailed link should carry it, and RENDER_EXTERNAL_URL keeps naming the onrender address
 * forever. Then RENDER_EXTERNAL_URL, set by the platform itself and never by a request, which
 * is what makes it safe against Host-header poisoning. The request's own host last, for a dev
 * box. Never the shared constant on its own: a preview deploy or a dev box emailing links to
 * production is worse than one emailing its own address. */
export function publicOrigin(req: Pick<Request, "protocol" | "get">): string {
  const configured = (process.env.PUBLIC_ORIGIN ?? "").trim().replace(/\/$/, "");
  if (configured) return configured;
  const render = (process.env.RENDER_EXTERNAL_URL ?? "").trim().replace(/\/$/, "");
  if (render) return render;
  return `${req.protocol}://${req.get("host")}`;
}

export { PUBLIC_ORIGIN };
