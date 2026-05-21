import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __indipetAdminPool: Pool | undefined;
}

function getDatabaseUrl() {
  const connectionString =
    process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

  if (!connectionString) {
    throw new Error(
      "Missing DATABASE_URL. Set DATABASE_URL in Vercel to your Supabase Postgres connection string.",
    );
  }

  if (process.env.NODE_ENV === "production") {
    let parsedUrl: URL;

    try {
      parsedUrl = new URL(connectionString);
    } catch {
      throw new Error("DATABASE_URL is invalid. Provide a full postgres connection string in Vercel.");
    }

    if (parsedUrl.hostname === "localhost" || parsedUrl.hostname === "127.0.0.1") {
      throw new Error("DATABASE_URL must point to Supabase or another external Postgres host in production.");
    }
  }

  return connectionString;
}

const poolConfig = {
  connectionString: getDatabaseUrl(),
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
