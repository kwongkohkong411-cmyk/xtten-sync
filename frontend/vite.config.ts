import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  plugins: [
    react(),
    {
      name: "inject-build-timestamp",
      transformIndexHtml(html) {
        const buildTs = process.env.BUILD_TS || Date.now().toString();
        return html.replace(/__BUILD_TS__/g, buildTs);
      },
    },
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
  },
});