import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __indipetAdminPool: Pool | undefined;
}

const connectionString = process.env.DATABASE_URL;

const poolConfig = connectionString
  ? {
      connectionString,
      ssl: { rejectUnauthorized: false },
    }
  : {
      host: process.env.PGHOST,
      port: Number(process.env.PGPORT || 5432),
      user: process.env.PGUSER,
      password: process.env.PGPASSWORD,
      database: process.env.PGDATABASE || "postgres",
      ssl: { rejectUnauthorized: false },
    };

export const pool = globalThis.__indipetAdminPool ?? new Pool(poolConfig);

if (process.env.NODE_ENV !== "production") {
  globalThis.__indipetAdminPool = pool;
}

export function quoteIdentifier(identifier: string) {
  return `"${identifier.replace(/"/g, '""')}"`;
}

export function quoteQualifiedName(name: string) {
  return name
    .split(".")
    .map((segment) => quoteIdentifier(segment))
    .join(".");
}
