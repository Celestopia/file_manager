import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
export default defineConfig({
  test: { include: ["src/**/*.test.{ts,tsx}"] },
  plugins: [react()],
  build: { outDir: "web-dist" },
  clearScreen: false,
});
