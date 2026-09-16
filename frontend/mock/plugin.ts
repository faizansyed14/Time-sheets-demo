import type { Plugin } from "vite";
import { mockMiddleware } from "./router";
import { getStore } from "./store";

export function mockApiPlugin(): Plugin {
  return {
    name: "timesheet-mock-api",
    configureServer(server) {
      // Load persisted demo store (or seed) — do NOT wipe on every restart.
      getStore();
      server.middlewares.use(mockMiddleware);
    },
    configurePreviewServer(server) {
      getStore();
      server.middlewares.use(mockMiddleware);
    },
  };
}
