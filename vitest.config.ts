import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig({
  plugins: [react(), tsconfigPaths(), yaml()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    // bench/ holds long-running performance benchmarks. Run them on demand
    // with `npx vitest run bench/<file>` rather than as part of yarn test.
    exclude: ["**/node_modules/**", "**/dist/**", "bench/**"],
  },
});
