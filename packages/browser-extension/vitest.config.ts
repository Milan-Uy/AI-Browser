import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["lib/__tests__/**/*.test.ts"],
  },
});
