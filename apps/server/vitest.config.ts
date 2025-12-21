import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    reporters: ['verbose'],
    globals: true,
    environment: "node",
    setupFiles: ["./tests/setup.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/**/*.d.ts",
        "src/index.ts",
        "src/routes/**", // Routes are better tested with integration tests
      ],
      thresholds: {
        // Increased thresholds to ensure better code quality
        // Current coverage: 64% stmts, 56% branches, 78% funcs, 64% lines
        lines: 60,
        functions: 75,
        branches: 55,
        statements: 60,
      },
    },
    include: ["tests/**/*.test.ts", "tests/**/*.spec.ts"],
    exclude: ["**/node_modules/**", "**/dist/**"],
    mockReset: true,
    restoreMocks: true,
    clearMocks: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Resolve shared packages to source files for proper mocking in tests
      "@automaker/utils": path.resolve(__dirname, "../../libs/utils/src/index.ts"),
      "@automaker/platform": path.resolve(__dirname, "../../libs/platform/src/index.ts"),
      "@automaker/types": path.resolve(__dirname, "../../libs/types/src/index.ts"),
      "@automaker/model-resolver": path.resolve(__dirname, "../../libs/model-resolver/src/index.ts"),
      "@automaker/dependency-resolver": path.resolve(__dirname, "../../libs/dependency-resolver/src/index.ts"),
      "@automaker/git-utils": path.resolve(__dirname, "../../libs/git-utils/src/index.ts"),
    },
  },
});
