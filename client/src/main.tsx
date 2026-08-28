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
