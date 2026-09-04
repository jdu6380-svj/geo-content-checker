import { main } from "./migrate-commercial.mjs";

if (process.env.COMMERCIAL_MIGRATION_CONFIRM?.trim() === "true") {
  if (process.env.VERCEL_ENV !== "preview") {
    console.error("COMMERCIAL MIGRATION BLOCKED PREVIEW_ONLY");
    process.exitCode = 1;
  } else {
    process.exitCode = await main();
  }
}
