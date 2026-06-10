import { Pool } from 'pg';


// Usage:
//   node scripts/truncate-all-public-tables.mjs \
//     --connectionString "postgresql://postgres:PASS@db....supabase.co:5432/postgres" \
//     [--schema public]

function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

function sanitizeSchemaName(schema) {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schema)) {
    throw new Error(`Invalid schema name: ${schema}`);
  }
  return schema;
}

const { connectionString, schema = 'public' } = parseArgs();
const conn = connectionString || process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_URL_NON_POOLING;

if (!conn) {
  console.error('Missing connection string. Pass --connectionString or set DATABASE_URL/POSTGRES_URL env var.');
  process.exit(1);
}

const safeSchema = sanitizeSchemaName(schema);

const pool = new Pool({ connectionString: conn, ssl: { rejectUnauthorized: false } });

const client = await pool.connect();
try {
  // Get all base tables (exclude views, exclude system tables)
  const tablesRes = await client.query(
    `SELECT table_name
     FROM information_schema.tables
     WHERE table_schema = $1
       AND table_type = 'BASE TABLE'
     ORDER BY table_name;`,
    [safeSchema],
  );

  const tables = tablesRes.rows.map(r => r.table_name);

  if (tables.length === 0) {
    console.log(`No base tables found in schema ${safeSchema}. Nothing to truncate.`);
    process.exit(0);
  }

  const qualifiedList = tables
    .map(t => `${'"' + t.replace(/"/g, '""') + '"'}`)
    .join(', ');

  // Wrap in schema qualification
  const qualified = tables
    .map(t => `"${safeSchema}"."${t.replace(/"/g, '""')}"`)
    .join(', ');

  console.log(`Truncating ${tables.length} tables in schema ${safeSchema}...`);

  // One statement truncation to allow CASCADE FK behavior.
  // Note: TRUNCATE ... CASCADE will also truncate dependent tables.
  const sql = `TRUNCATE ${qualified} RESTART IDENTITY CASCADE;`;

  await client.query(sql);
  console.log('Done.');
} finally {
  client.release();
  await pool.end();
}

