// Bench config, used by `npx vitest run --config vitest.bench.config.ts`
// to run files in bench/ that are excluded from the default test run.
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: "node",
    globals: true,
    include: ["bench/**/*.test.ts"],
  },
});
