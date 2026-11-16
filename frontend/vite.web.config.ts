import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { renameSync } from "node:fs";

// Separate build: does not change the Electron entry, output or development config.
export default defineConfig({
  plugins: [react(), tailwindcss(), {
    name: "web-entry",
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.headers.accept?.includes("text/html") && !req.url?.startsWith("/api/")) req.url = "/web.html";
        next();
      });
    },
    closeBundle() {
      renameSync(path.resolve(import.meta.dirname, "dist-web/web.html"), path.resolve(import.meta.dirname, "dist-web/index.html"));
    },
  }],
  resolve: { alias: [
    { find: "@", replacement: path.resolve(import.meta.dirname, "src") },
    { find: /^lucide-react$/, replacement: path.resolve(import.meta.dirname, "src/lib/lucide-react.tsx") },
    { find: "lucide-react-upstream", replacement: path.resolve(import.meta.dirname, "node_modules/lucide-react") },
    { find: /^recharts$/, replacement: path.resolve(import.meta.dirname, "src/lib/recharts.tsx") },
    { find: "recharts-upstream", replacement: path.resolve(import.meta.dirname, "node_modules/recharts") },
  ] },
  build: { outDir: "dist-web", rollupOptions: { input: path.resolve(import.meta.dirname, "web.html") } },
  server: { host: "127.0.0.1", port: 3001, strictPort: true,
    proxy: { "/api": { target: "http://127.0.0.1:8001", changeOrigin: false } } },
});
