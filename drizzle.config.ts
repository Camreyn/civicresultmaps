import { defineConfig } from "drizzle-kit";
import { getDatabaseUrl } from "./src/db/url";

export default defineConfig({
  schema: ["./src/db/schema.ts", "./src/db/ui-layout-v3-schema.ts", "./src/db/ui-layout-v4-schema.ts"],
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});
