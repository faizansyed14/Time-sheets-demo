import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { mockApiPlugin } from "./mock/plugin";

// Backend proxy removed — mockApiPlugin serves /api and /health in-process.
// To point at a real backend instead, comment out mockApiPlugin() and restore:
// const target = process.env.VITE_PROXY_TARGET || "http://localhost:8000";
// proxy: { "/api": { target, changeOrigin: true }, "/health": { target, changeOrigin: true } }

const hmrClientPort = process.env.VITE_HMR_CLIENT_PORT
  ? Number(process.env.VITE_HMR_CLIENT_PORT)
  : undefined;

export default defineConfig({
  plugins: [react(), mockApiPlugin()],
  server: {
    port: 5173,
    host: true,
    hmr: hmrClientPort ? { clientPort: hmrClientPort } : undefined,
  },
  preview: {
    port: 5173,
    host: true,
  },
});
