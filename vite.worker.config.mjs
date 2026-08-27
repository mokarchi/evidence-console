import { defineConfig } from "vite";

export default defineConfig({
  build: {
    emptyOutDir: true,
    outDir: "dist/server",
    rollupOptions: {
      output: {
        entryFileNames: "index.js",
        format: "es",
      },
    },
    ssr: "worker/index.js",
  },
});
