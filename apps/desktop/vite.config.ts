import { defineConfig } from "vite";
import solid from "vite-plugin-solid";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [solid(), tailwindcss()],
  clearScreen: false,
  server: {
    host: "localhost",
    port: 1420,
    strictPort: true,
  },
  build: {
    target: "es2022",
  },
});
