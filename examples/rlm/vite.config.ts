import { cloudflare } from "@cloudflare/vite-plugin";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), cloudflare()],
  build: {
    // The single-page demo includes the Agents chat client and three comparison lanes.
    chunkSizeWarningLimit: 550,
  },
});
