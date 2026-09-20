import express, { type Express } from "express";
import fs from "fs";
import path from "path";
import { createServer as createViteServer, createLogger } from "vite";
import type { Server } from "http";
import viteConfig from "../vite.config";
import { PUBLIC_STATIC_OPTIONS, servePrerendered, spaFallback, staticLimiter } from "./public-static";
import { cacheControlForStaticPath, REVALIDATE_CACHE_CONTROL } from "./static-cache-policy";

const viteLogger = createLogger();

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

function setStaticCacheHeaders(res: express.Response, filePath: string) {
  // express.static hands over the resolved file path; the policy is by URL prefix, and the
  // two agree because dist/public is served at the root with no mount path.
  const relative = path.relative(path.resolve(import.meta.dirname, "public"), filePath);
  res.setHeader("Cache-Control", cacheControlForStaticPath("/" + relative.split(path.sep).join("/")));
}

export function serveStatic(app: Express) {
  const distPath = path.resolve(import.meta.dirname, "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(staticLimiter);
  app.use(revalidateDocuments());
  // A public route's prerendered head, at its clean URL, BEFORE express.static can see a
  // directory of the same name and answer with a redirect or fall through to the root page.
  // See server/public-static.ts for the two ways that went wrong.
  app.use(servePrerendered(distPath));
  app.use(express.static(distPath, { ...PUBLIC_STATIC_OPTIONS, setHeaders: setStaticCacheHeaders }));
  // A missing build asset is a 404, not the app's HTML -- see spaFallback in
  // server/public-static.ts for why, and for the mount-path bug that had it silently
  // answering every missing chunk with a 200 for as long as it existed.
  app.use("*", spaFallback(distPath));
}

// The prerendered pages and the SPA shell go out through res.sendFile in public-static.ts,
// which sets no Cache-Control at all; without one a browser is free to heuristically cache
// the document, which is the one file that must always be revalidated after a deploy.
// Stated once here rather than in that file, so this module owns every static header.
export function revalidateDocuments(): express.RequestHandler {
  return (req, res, next) => {
    if ((req.method === "GET" || req.method === "HEAD") && !/\.[a-zA-Z0-9]+$/.test(req.path)) {
      res.setHeader("Cache-Control", REVALIDATE_CACHE_CONTROL);
    }
    next();
  };
}
