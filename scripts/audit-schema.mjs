import fs from 'fs';
import path from 'path';

const root = process.cwd();
const schemaPath = path.join(root, 'schema.json');
const portalSchemaPath = path.join(root, 'src', 'lib', 'portal-schema.ts');
const outDir = path.join(root, 'reports');
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const schemaRaw = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
const portalRaw = fs.readFileSync(portalSchemaPath, 'utf8');

// Extract portalSections array by finding `portalSections: PortalSection[] = [` and matching until the closing `];`
const sectionsStart = portalRaw.indexOf('export const portalSections');
if (sectionsStart === -1) {
  console.error('portalSections export not found in portal-schema.ts');
  process.exit(2);
}
const sliceFrom = portalRaw.slice(sectionsStart);
const bracketStart = sliceFrom.indexOf('[');
let depth = 0;
let i = bracketStart;
let found = false;
for (; i < sliceFrom.length; i++) {
  if (sliceFrom[i] === '[') depth++;
  if (sliceFrom[i] === ']') {
    depth--;
    if (depth === 0) {
      found = true;
      break;
    }
  }
}
if (!found) {
  console.error('Could not parse portalSections array');
  process.exit(2);
}
const sectionsText = sliceFrom.slice(bracketStart, i + 1);

// Find sections titles and their tables by simple regex
const sectionRegex = /\{[\s\S]*?title: *"([^"]+)"[\s\S]*?tables: *\[([\s\S]*?)\]/g;
let match;
const portalSections = [];
while ((match = sectionRegex.exec(sectionsText)) !== null) {
  const title = match[1];
  const tablesBlock = match[2];
  const tableNameRegex = /"([a-z0-9_]+)"/gi;
  const tables = [];
  let tmatch;
  while ((tmatch = tableNameRegex.exec(tablesBlock)) !== null) {
    tables.push(tmatch[1]);
  }
  portalSections.push({ title, tables });
}

const portalTableSet = new Set(portalSections.flatMap((s) => s.tables));
const schemaTableSet = new Set(schemaRaw.map((t) => t.table_name));

const tablesOnlyInSchema = [...schemaTableSet].filter((t) => !portalTableSet.has(t)).sort();
const tablesOnlyInPortal = [...portalTableSet].filter((t) => !schemaTableSet.has(t)).sort();

const details = {};
for (const t of schemaRaw) {
  details[t.table_name] = {
    primary_key: t.primary_key,
    column_count: t.columns.length,
    columns: t.columns,
    foreign_keys: t.foreign_keys || [],
  };
}

const report = {
  generated_at: new Date().toISOString(),
  total_schema_tables: schemaRaw.length,
  total_portal_tables: portalTableSet.size,
  tables_only_in_schema: tablesOnlyInSchema,
  tables_only_in_portal: tablesOnlyInPortal,
  portal_sections: portalSections,
  table_details: details,
};

const outPath = path.join(outDir, 'schema-audit.json');
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log('Audit written to', outPath);
process.exit(0);
