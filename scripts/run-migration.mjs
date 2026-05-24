#!/usr/bin/env node
import fs from "fs";
import path from "path";
import { Client } from "pg";

const DATABASE_URL = process.env.DATABASE_URL;
const migrationsDir = path.resolve(process.cwd(), "migrations");

if (!DATABASE_URL) {
  console.error("Error: DATABASE_URL environment variable is not set. Aborting migration.");
  process.exit(1);
}

const migrationFiles = fs.readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();
const client = new Client({ connectionString: DATABASE_URL });

try {
  await client.connect();

  for (const fileName of migrationFiles) {
    const migrationPath = path.join(migrationsDir, fileName);
    const sql = fs.readFileSync(migrationPath, "utf8");

    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log(`Migration applied: ${fileName}`);
  }

  process.exit(0);
} catch (err) {
  try { await client.query("ROLLBACK"); } catch { /* ignore */ }
  console.error("Migration failed:", err.message || err);
  process.exit(1);
} finally {
  await client.end();
}
