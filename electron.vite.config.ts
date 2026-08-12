import { defineConfig } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  main: {
    build: {
      outDir: "dist/main",
      rollupOptions: {
        external: ["sharp", "rapidocrjson"]
      },
      lib: {
        entry: "src/main/main.ts",
        formats: ["cjs"]
      }
    }
  },
  preload: {
    build: {
      outDir: "dist/preload",
      lib: {
        entry: "src/preload/preload.ts",
        formats: ["cjs"]
      }
    }
  },
  renderer: {
    base: "./",
    root: "src/renderer",
    plugins: [react()],
    build: {
      outDir: resolve(__dirname, "dist/renderer"),
      emptyOutDir: true
    }
  }
});
