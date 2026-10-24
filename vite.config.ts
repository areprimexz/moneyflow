import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

// Use the IPv4 loopback explicitly: on Windows, Node resolves "localhost" to ::1 first.
const apiTarget = `http://127.0.0.1:${process.env.API_PORT ?? 8787}`;

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "@shared": fileURLToPath(new URL("./shared", import.meta.url)),
    },
  },
  server: {
    port: 5173,
    host: true,
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
  },
  preview: {
    proxy: { "/api": { target: apiTarget, changeOrigin: true } },
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
