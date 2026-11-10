import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// base "./" makes the build work at any GitHub Pages path
// (https://<user>.github.io/<repo>/) without hard-coding the repo name.
export default defineConfig({
  plugins: [react()],
  base: "./",
});
