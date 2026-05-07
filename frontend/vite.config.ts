import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiTarget = process.env.VITE_DEV_API_PROXY ?? "http://127.0.0.1:4000";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/_/backend": {
        target: apiTarget,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/_\/backend/, "") || "/"
      },
      "/editor": { target: apiTarget, changeOrigin: true },
      "/content": { target: apiTarget, changeOrigin: true },
      "/ai": { target: apiTarget, changeOrigin: true }
    }
  }
});
