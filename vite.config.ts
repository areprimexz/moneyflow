import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import type { IncomingMessage, ServerResponse } from "node:http";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";

/**
 * Serves the FLUX API from inside the Vite dev server (same port as the web app).
 * If the API cannot start, every /api request answers with the startup error so the
 * reason is visible in the browser as well as in the terminal.
 */
function fluxApi(): Plugin {
  return {
    name: "flux-api",
    apply: "serve",
    async configureServer(server) {
      type Listener = (req: IncomingMessage, res: ServerResponse) => unknown;
      let listener: Listener | null = null;
      let startupError: string | null = null;
      try {
        const mod = (await server.ssrLoadModule("/server/dev.ts")) as typeof import("./server/dev");
        const api = mod.createDevApi();
        listener = api.listener as Listener;
        server.httpServer?.once("close", api.close);
        server.config.logger.info(`  FLUX API ready (database: ${api.dbPath}, driver: ${api.driver})`);
      } catch (e) {
        startupError = e instanceof Error ? e.message : String(e);
        server.config.logger.error(`\n  FLUX API failed to start: ${startupError}\n`);
        if (e instanceof Error && e.stack) server.config.logger.error(e.stack);
      }
      server.middlewares.use((req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        if (listener) return void listener(req, res);
        res.statusCode = 503;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ error: { code: "api_startup_failed", message: `The FLUX API failed to start: ${startupError}` } }));
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), fluxApi()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
  },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          charts: ["lightweight-charts"],
          vendor: ["react", "react-dom", "react-router", "@tanstack/react-query"],
        },
      },
    },
  },
});
