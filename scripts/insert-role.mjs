import fs from 'fs';
import path from 'path';
import { Client } from 'pg';

function loadEnv(file) {
  const p = path.resolve(process.cwd(), file);
  if (!fs.existsSync(p)) return {};
  const txt = fs.readFileSync(p, 'utf8');
  const out = {};
  for (const line of txt.split(/\r?\n/)) {
    const m = line.match(/^\s*([^#=\s]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    out[m[1]] = m[2];
  }
  return out;
}

const env = loadEnv('.env.local');
const connectionString = env.DATABASE_URL || process.env.DATABASE_URL;
if (!connectionString) {
  console.error('Missing DATABASE_URL in .env.local or environment');
  process.exit(1);
}

const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });

(async () => {
  try {
    await client.connect();
    const name = process.argv[2] || 'AutoRole-DB-' + Math.floor(Math.random() * 90000 + 10000);
    const status = 'ACTIVE';
    const permissions = {};

    const insert = await client.query(
      'insert into role_master (role_name, status, permissions) values ($1,$2,$3) returning role_id, role_code, role_name, status, permissions',
      [name, status, permissions],
    );

    console.log(JSON.stringify({ created: insert.rows[0] }, null, 2));

    const list = await client.query('select role_id, role_code, role_name from role_master order by role_id desc limit 5');
    console.log(JSON.stringify({ recent: list.rows }, null, 2));
  } catch (err) {
    console.error('Error:', err.message || err);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
