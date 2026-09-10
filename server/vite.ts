import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import rateLimit from "express-rate-limit";
import { createServer as createViteServer, createLogger } from "vite";
import type { Server } from "http";
import viteConfig from "../vite.config";

const viteLogger = createLogger();

// Both setupVite's (dev) and serveStatic's (production) catch-alls sit
// outside routes.ts's general /api limiter entirely -- they're mounted
// directly on the app in index.ts, not inside registerRoutes. Its own
// budget, not apiLimiter's: a single page load can fire far more of these
// (every JS/CSS chunk, image, and the SPA shell itself) than it does JSON
// API calls, so sharing a counter would let normal asset loading exhaust
// the budget a user's actual API calls need. No session/user context is
// reliably available at this layer either way (this runs for the very
// first request of a fresh page load, before any app code executes), so
// this one is keyed by IP only.
const staticLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many requests. Please try again shortly." },
});

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: {
      middlewareMode: true,
      hmr: { server },
    },
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", staticLimiter, async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "..",
        "client",
        "index.html",
      );

      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${Date.now()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(staticLimiter);
  app.use(express.static(distPath));
  // A MISSING BUILD ASSET IS A 404, NOT THE APP'S HTML.
  //
  // Everything unmatched fell through to index.html, including a request for a hashed asset
  // that no longer exists -- which is exactly what a browser does for the seconds and minutes
  // after a deploy, with a tab still open on the previous build asking for chunks that were
  // just replaced. Handing back index.html with a 200 and text/html means the browser's
  // dynamic import() gets a document where a module should be, and the failure surfaces as
  // something incomprehensible ("Cannot read properties of undefined (reading 'default')")
  // rather than as what it is.
  //
  // A real 404 makes it legible, and it is also what the client's own recovery is waiting
  // for: main.tsx's vite:preloadError listener and lazy-load-recovery.ts turn a failed chunk
  // fetch into one reload onto the current build. A 200 never reaches either of them.
  //
  // Anything with a file extension is an asset request; a client route (/admin/exercises) has
  // none and still gets the app.
  app.use("*", (req, res) => {
    if (/\.[a-zA-Z0-9]+$/.test(req.path)) {
      return res.status(404).type("text/plain").send("Not found");
    }
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
