import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      main: "./src/index.ts",
      miniflare: {
        compatibilityDate: "2025-06-01",
        compatibilityFlags: ["nodejs_compat"],
        d1Databases: { GLASS_CATALOG_D1: ":memory:" },
        kvNamespaces: ["GLASS_CATALOG"],
        bindings: {
          ENVIRONMENT: "test",
          SVV_API_KEY: "NOT_SET",
          BILUPPGIFTER_API_KEY: "NOT_SET",
          BOVSOFT_CLIENT_ID: "NOT_SET",
          BOVSOFT_SECCODE: "NOT_SET",
        },
      },
    }),
  ],
  test: {
    // Default Vitest reporter. Allure was attempted but the allure-vitest
    // reporter/setup triggers a workerd segfault in this pool-workers setup,
    // so it is left out despite being present in devDependencies.
  },
});
