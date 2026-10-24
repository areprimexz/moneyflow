import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApi } from "./app";
import { createFlux } from "./flux";

const production = process.env.NODE_ENV === "production";
const port = Number(process.env.PORT ?? (production ? 4173 : 8787));
const dbPath = process.env.FLUX_DB_PATH ?? resolve(process.cwd(), "data/flux.db");

const flux = createFlux({ dbPath, initialBalance: process.env.FLUX_INITIAL_BALANCE });
flux.startBackground();
const app = createApi(flux.ctx);

if (production) {
  const dist = resolve(process.cwd(), "dist");
  if (!existsSync(resolve(dist, "index.html"))) {
    console.error("dist/index.html not found — run `npm run build` first.");
    process.exit(1);
  }
  const indexHtml = readFileSync(resolve(dist, "index.html"), "utf8");
  app.use("/assets/*", serveStatic({ root: "./dist" }));
  app.use("/favicon.svg", serveStatic({ path: "./dist/favicon.svg" }));
  // Client-side routes fall back to the SPA shell.
  app.get("*", (c) => (c.req.path.startsWith("/api/") ? c.json({ error: { code: "not_found", message: "Endpoint not found." } }, 404) : c.html(indexHtml)));
}

const server = serve({ fetch: app.fetch, port, hostname: process.env.HOST ?? "0.0.0.0" }, (info) => {
  console.log(`FLUX FINANCE ${production ? "server" : "API"} listening on http://localhost:${info.port} (database: ${dbPath})`);
});

function shutdown() {
  server.close();
  flux.close();
  process.exit(0);
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
