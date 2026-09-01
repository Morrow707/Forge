import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { Button } from "@/components/ui/button";
import App from "./App";
import { startOfflineLogSync } from "@/lib/offline-queue";
import { startOfflineVideoSync } from "@/lib/video-offline-store";
import { bootstrapNativeShell } from "@/lib/native-bootstrap";
import "./index.css";

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

// Client-side twin of server/index.ts's scrubPii -- see that file's own comment for why
// dataCollection's defaults aren't trusted as-is and why this exists as a second, independent
// pass over event text specifically (a thrown error whose message happens to echo a user's
// email, which dataCollection doesn't touch since that's about structured request/DB context,
// not string content).
function scrubPii(event: Sentry.ErrorEvent, _hint: Sentry.EventHint): Sentry.ErrorEvent {
  if (event.message) event.message = event.message.replace(EMAIL_PATTERN, "[redacted-email]");
  for (const ex of event.exception?.values ?? []) {
    if (ex.value) ex.value = ex.value.replace(EMAIL_PATTERN, "[redacted-email]");
  }
  for (const crumb of event.breadcrumbs ?? []) {
    if (crumb.message) crumb.message = crumb.message.replace(EMAIL_PATTERN, "[redacted-email]");
  }
  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
    delete event.request.headers;
  }
  return event;
}

// Client-side twin of server/index.ts's Sentry setup -- same silently
// no-op-until-configured pattern, and the same locked-all-the-way-down
// dataCollection posture (see that file's own comment on why the SDK's own
// defaults aren't trusted as-is for an app that handles minors' video and
// performance data). VITE_SENTRY_DSN (not SENTRY_DSN) since Vite only
// exposes VITE_-prefixed env vars to client code, and needs it at build
// time, not just runtime -- Render's build step already reads the
// service's env vars either way.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: false, response: false },
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: scrubPii,
  });
}

// Fires when a lazy-loaded route's chunk 404s -- happens whenever someone
// has the app open in a tab from before a deploy and then navigates to a
// page whose JS file has since been replaced by a new deploy's differently-
// hashed filename (the old one no longer exists on the server at all). Not
// a real bug in the app, just a stale tab; a fresh load picks up the
// current index.html and current chunk hashes, which fixes it completely.
// sessionStorage guard is a one-shot: if reloading doesn't actually help
// (a genuinely broken deploy, not a stale tab), this falls through to the
// normal ErrorBoundary fallback below instead of reload-looping forever.
//
// event.preventDefault() matters here, confirmed against Vite's own
// generated preload-helper source (node_modules/vite/dist/node/chunks --
// the preload() function's handlePreloadError): the failed dynamic import
// is caught internally and only re-thrown if this event's defaultPrevented
// is still false after dispatch. Without this call, this listener still
// kicks off the reload, but the original error is ALSO re-thrown right
// after -- and since reload() doesn't halt JS execution immediately, that
// re-thrown error was winning the race into React.lazy's Suspense boundary
// and crashing into the Sentry ErrorBoundary a tick before the reload
// actually took effect (exactly the "'text/html' is not a valid JavaScript
// MIME type" TypeError Sentry flagged as a production crash -- the reload
// recovery was already firing, this was just also reporting noise on the
// way out).
window.addEventListener("vite:preloadError", (event) => {
  event.preventDefault();
  if (sessionStorage.getItem("reloaded-after-preload-error")) return;
  sessionStorage.setItem("reloaded-after-preload-error", "1");
  window.location.reload();
});

// A crash here means something in the React tree itself threw, so this
// can't lean on client-side routing (wouter) still working -- a full
// reload is the one recovery path guaranteed to work regardless of what
// broke.
function ErrorFallback() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="font-display text-2xl font-extrabold text-primary">Something went wrong</h1>
      <p className="text-muted-foreground">This has been reported. Reloading usually fixes it.</p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  );
}

startOfflineLogSync();
startOfflineVideoSync();
createRoot(document.getElementById("root")!).render(
  <Sentry.ErrorBoundary fallback={<ErrorFallback />}>
    <App />
  </Sentry.ErrorBoundary>,
);
void bootstrapNativeShell();
