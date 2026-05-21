import fs from 'fs';
import { Client } from 'pg';
import path from 'path';

// Load .env.local (simple key=value parser)
const envPath = path.join(process.cwd(), '.env.local');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (!(key in process.env)) process.env[key] = val;
  }
}

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('No DATABASE_URL found in environment or .env.local');
  process.exit(2);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await client.connect();
    const res = await client.query('SELECT 1 AS ok');
    console.log('DB connection test succeeded:', res.rows[0]);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.error('DB connection test failed:');
    console.error(err instanceof Error ? err.message : String(err));
    try { await client.end(); } catch {}
    process.exit(3);
  }
})();
