import { neon } from "@neondatabase/serverless";

import { CommercialDataUnavailableError } from "./domain";

export type NeonSqlClient = ReturnType<typeof neon>;

let sqlClient: NeonSqlClient | null = null;

export function getNeonSql(): NeonSqlClient {
  if (sqlClient) return sqlClient;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new CommercialDataUnavailableError();
  sqlClient = neon(databaseUrl);
  return sqlClient;
}
