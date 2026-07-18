import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  cacheDir: ".vite-cache",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
  },
});
