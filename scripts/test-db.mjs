import fs from 'fs';
import path from 'path';
import { Pool } from 'pg';

function loadEnv(envPath) {
  if (!fs.existsSync(envPath)) return {};
  const raw = fs.readFileSync(envPath, 'utf8');
  const lines = raw.split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq);
    let val = trimmed.slice(eq + 1);
    if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}

(async () => {
  try {
    const env = loadEnv(path.join(process.cwd(), '.env.local'));
    const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;
    if (!connectionString) {
      console.error('No DATABASE_URL found in environment or .env.local');
      process.exit(2);
    }

    const pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
    const res = await pool.query('SELECT 1 AS one, NOW() AS now');
    console.log('Connected OK');
    console.log(JSON.stringify(res.rows, null, 2));
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('Connection failed:', err && err.message ? err.message : String(err));
    process.exit(1);
  }
})();
