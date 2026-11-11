import { defineConfig } from "vite";

// Relative base so the built site works from any host or sub-path (GitHub Pages, Netlify, Cloudflare Pages).
export default defineConfig({
  base: "./",
  build: {
    target: "es2022",
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 700,
  },
});
