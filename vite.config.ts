import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tauri builds against the system WebView2 (Edge/Chromium), so we can target
// modern JS. Minification is disabled in Tauri debug builds for readable stacks.
const isTauriDebug = !!process.env.TAURI_ENV_DEBUG;

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({
      autoCodeSplitting: true,
      routesDirectory: "./src/routes",
      generatedRouteTree: "./src/routeTree.gen.ts",
    }),
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },

  // Vite options tailored for Tauri development.
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],

  server: {
    port: 1420,
    strictPort: true,
    host: false,
    hmr: {
      protocol: "ws",
      host: "localhost",
      clientPort: 1420,
    },
    watch: {
      // Tauri sources are watched by cargo, not Vite.
      ignored: ["**/src-tauri/**"],
    },
  },

  build: {
    target: "esnext",
    outDir: "dist",
    minify: isTauriDebug ? false : "esbuild",
    sourcemap: !!isTauriDebug,
  },
});
