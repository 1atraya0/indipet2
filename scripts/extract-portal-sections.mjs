import fs from 'fs';
import path from 'path';

const root = process.cwd();
const portalPath = path.join(root, 'src', 'lib', 'portal-schema.ts');
const schemaPath = path.join(root, 'schema.json');
const outPath = path.join(root, 'reports', 'portal-sections.json');

const portalRaw = fs.readFileSync(portalPath, 'utf8');
const schemaRaw = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

const sectionMatches = [...portalRaw.matchAll(/\{([\s\S]*?)\}\s*,?/g)];
const sections = [];
for (const m of sectionMatches) {
  const block = m[1];
  if (!/title\s*:/i.test(block)) continue;
  const titleMatch = block.match(/title:\s*"([^"]+)"/);
  const tablesMatch = block.match(/tables:\s*\[([\s\S]*?)\]/);
  if (!titleMatch) continue;
  const title = titleMatch[1];
  const tables = [];
  if (tablesMatch) {
    const content = tablesMatch[1];
    const tMatchAll = [...content.matchAll(/"([a-z0-9_]+)"/gi)];
    for (const tm of tMatchAll) tables.push(tm[1]);
  }
  sections.push({ title, tables });
}

const portalTableSet = new Set(sections.flatMap(s => s.tables));
const schemaTableSet = new Set(schemaRaw.map(t => t.table_name));

const onlyInSchema = [...schemaTableSet].filter(t => !portalTableSet.has(t)).sort();
const onlyInPortal = [...portalTableSet].filter(t => !schemaTableSet.has(t)).sort();

const report = { generated_at: new Date().toISOString(), portal_sections: sections, total_schema_tables: schemaRaw.length, total_portal_tables: portalTableSet.size, tables_only_in_schema: onlyInSchema, tables_only_in_portal: onlyInPortal };
fs.writeFileSync(outPath, JSON.stringify(report, null, 2), 'utf8');
console.log('Wrote', outPath);
