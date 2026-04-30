import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsconfigPaths from "vite-tsconfig-paths";
import yaml from "@modyfi/vite-plugin-yaml";

export default defineConfig({
  plugins: [react(), tailwindcss(), tsconfigPaths(), yaml()],
  worker: {
    plugins: () => [tsconfigPaths(), yaml()],
  },
  server: {
    host: "0.0.0.0",
    open: true,
  },
  build: {
    // Production must never ship source maps. They would leak comments and
    // original variable names containing financial logic to the public CDN.
    // Vite's default is already false, but pinning it here is a one-line
    // defence against accidental flips during debugging.
    sourcemap: false,
    rollupOptions: {
      output: {
        // Split the heaviest vendor chunks so the initial bundle stays
        // small. visx and Radix together are ~150-200KB gzipped; routing
        // them to separate chunks lets the browser cache them across
        // deploys that don't change the chart/primitive code.
        manualChunks: {
          visx: [
            "@visx/axis",
            "@visx/event",
            "@visx/group",
            "@visx/responsive",
            "@visx/scale",
            "@visx/shape",
            "@visx/text",
            "@visx/tooltip",
          ],
          radix: [
            "@radix-ui/react-checkbox",
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-radio-group",
            "@radix-ui/react-select",
            "@radix-ui/react-slider",
            "@radix-ui/react-switch",
            "@radix-ui/react-tabs",
            "@radix-ui/react-toast",
            "@radix-ui/react-tooltip",
            "@radix-ui/react-visually-hidden",
          ],
        },
      },
    },
  },
});
