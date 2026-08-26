import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { defaultStore, handleApiRequest } from "./src/lib/api.js";

function localApiPlugin() {
  return {
    name: "evidence-console-local-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const body = chunks.length ? Buffer.concat(chunks) : undefined;
        const request = new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body, duplex: "half" });
        const response = await handleApiRequest(request, defaultStore);
        res.statusCode = response.status;
        response.headers.forEach((value, key) => res.setHeader(key, value));
        res.end(Buffer.from(await response.arrayBuffer()));
      });
    },
  };
}

export default defineConfig({
  build: {
    outDir: "dist/client",
  },
  optimizeDeps: {
    include: ["react", "react-dom/client"],
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: ["terminal.local"],
    warmup: {
      clientFiles: ["./src/main.jsx"],
    },
  },
  plugins: [react(), localApiPlugin()],
});
