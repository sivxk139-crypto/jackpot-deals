import { defineConfig } from "vite";

// Forward API calls from the Vite development server to the Node/Express backend.
// Keep the backend running on http://localhost:3000 while using `npm run dev`.
export default defineConfig({
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
