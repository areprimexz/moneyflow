import { getRequestListener } from "@hono/node-server";
import { resolve } from "node:path";
import { createApi } from "./app";
import { createFlux } from "./flux";

/**
 * In-process API for `npm run dev`: mounted inside the Vite dev server, so the web app and
 * the API share one port and there is no proxy or second process to go wrong.
 */
export function createDevApi() {
  const dbPath = process.env.FLUX_DB_PATH ?? resolve(process.cwd(), "data/flux.db");
  const flux = createFlux({ dbPath, initialBalance: process.env.FLUX_INITIAL_BALANCE });
  flux.startBackground();
  const app = createApi(flux.ctx);
  return {
    dbPath,
    driver: flux.handle.sqlite.driver,
    listener: getRequestListener(app.fetch),
    close: () => flux.close(),
  };
}
