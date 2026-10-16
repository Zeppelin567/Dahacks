import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["test/**/*.test.ts"],
    setupFiles: ["./test/setup.ts"],
    // Tests use an in-memory database and never read the repo .env.
    env: { NODE_ENV: "test" },
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
