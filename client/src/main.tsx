import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { Button } from "@/components/ui/button";
import App from "./App";
import { startOfflineLogSync } from "@/lib/offline-queue";
import { startOfflineVideoSync } from "@/lib/video-offline-store";
import { bootstrapNativeShell } from "@/lib/native-bootstrap";
import "./index.css";

// Client-side twin of server/index.ts's Sentry setup -- same silently
// no-op-until-configured pattern. VITE_SENTRY_DSN (not SENTRY_DSN) since
// Vite only exposes VITE_-prefixed env vars to client code, and needs it
// at build time, not just runtime -- Render's build step already reads
// the service's env vars either way.
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({ dsn: import.meta.env.VITE_SENTRY_DSN });
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
window.addEventListener("vite:preloadError", () => {
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
