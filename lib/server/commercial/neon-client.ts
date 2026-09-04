import { neon } from "@neondatabase/serverless";

import { CommercialDataUnavailableError } from "./domain";

export type NeonSqlClient = ReturnType<typeof neon>;

let sqlClient: NeonSqlClient | null = null;

export function getCommercialDatabaseUrl(): string | null {
  return process.env.NEON_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim() || null;
}

export function getNeonSql(): NeonSqlClient {
  if (sqlClient) return sqlClient;
  const databaseUrl = getCommercialDatabaseUrl();
  if (!databaseUrl) throw new CommercialDataUnavailableError();
  sqlClient = neon(databaseUrl);
  return sqlClient;
}
