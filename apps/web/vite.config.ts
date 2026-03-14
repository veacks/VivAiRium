import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  worker: {
    format: "es"
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: process.env.VITE_FUNCTIONS_ORIGIN ?? "http://localhost:9999",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/.netlify/functions")
      }
    }
  }
});
