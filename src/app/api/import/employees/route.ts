import { NextResponse } from "next/server";
import { pool, quoteIdentifier } from "@/lib/db";
import { tableLookup } from "@/lib/portal-schema";
import * as XLSX from "xlsx";

const COLUMN_MAP: Record<string, string> = {
  "first name": "first_name",
  "last name": "last_name",
  "employee code": "employee_code",
  "employee type": "employee_type",
  "employment subtype": "employment_subtype",
  phone: "phone",
  email: "email",
  gender: "gender",
  "date of joining": "date_of_joining",
  "original doj": "original_doj",
  department: "department_id",
  designation: "designation_id",
  location: "location_id",
  "parent entity": "parent_entity_id",
  "reporting manager": "reporting_manager_id",
  "employee category": "employee_category",
  "is salesperson": "is_salesperson",
  "login id": "login_id",
  role: "role_id",
  "default shift": "default_shift_id",
  "face registered": "face_registered",
  "shift preference mode": "shift_preference_mode",
  status: "status",
  "date of exit": "date_of_exit",
  "exit type": "exit_type",
};

async function resolveLookup(
  lookupTable: string,
  value: string,
): Promise<string | null> {
  if (!value || !lookupTable) return null;
  const table = tableLookup[lookupTable];
  if (!table) return null;

  const nameCols = table.columns
    .filter((c) => /name|code|title/i.test(c.column))
    .slice(0, 2);

  for (const col of nameCols) {
    const r = await pool.query(
      `select ${quoteIdentifier(table.primary_key[0])} as id from ${quoteIdentifier(lookupTable)} where ${quoteIdentifier(col.column)} ilike $1 limit 1`,
      [`%${value.trim()}%`],
    );
    if (r.rows.length > 0) return String(r.rows[0].id);
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    let workbook: XLSX.WorkBook;
    try {
      workbook = XLSX.read(buf, { type: "buffer" });
    } catch {
      return NextResponse.json({ error: "Unable to parse file" }, { status: 400 });
    }

    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return NextResponse.json({ error: "Workbook is empty" }, { status: 400 });
    }

    const sheet = workbook.Sheets[sheetName];
    const rawRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);
    if (rawRows.length === 0) {
      return NextResponse.json({ error: "No data rows found" }, { status: 400 });
    }

    const table = tableLookup["employee_master"];
    if (!table) {
      return NextResponse.json({ error: "employee_master table not found" }, { status: 500 });
    }

    const results: { row: number; status: string; message: string }[] = [];
    let created = 0;
    let skipped = 0;

    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i];
      const record: Record<string, unknown> = {};
      let hasValue = false;

      for (const [header, value] of Object.entries(raw)) {
        const col = COLUMN_MAP[header.trim().toLowerCase()];
        if (!col) continue;

        const colDef = table.columns.find((c) => c.column === col);
        if (!colDef) continue;

        const strVal = String(value ?? "").trim();
        if (!strVal) continue;

        const fk = table.foreign_keys.find((fk) => fk.column === col);
        if (fk) {
          const resolved = await resolveLookup(fk.references_table, strVal);
          if (resolved) {
            record[col] = resolved;
          }
          continue;
        }

        record[col] = strVal;
        hasValue = true;
      }

      if (!hasValue || (!record.first_name && !record.phone && !record.email)) {
        results.push({ row: i + 2, status: "skipped", message: "No identifiable fields" });
        skipped++;
        continue;
      }

      if (record.phone) {
        const dup = await pool.query(
          `select employee_id from employee_master where phone = $1 limit 1`,
          [String(record.phone)],
        );
        if (dup.rows.length > 0) {
          results.push({ row: i + 2, status: "skipped", message: `Duplicate phone: ${record.phone}` });
          skipped++;
          continue;
        }
      }

      if (record.email) {
        const dup = await pool.query(
          `select employee_id from employee_master where email = $1 limit 1`,
          [String(record.email)],
        );
        if (dup.rows.length > 0) {
          results.push({ row: i + 2, status: "skipped", message: `Duplicate email: ${record.email}` });
          skipped++;
          continue;
        }
      }

      try {
        const columns = Object.keys(record);
        const values = columns.map((c) => record[c]);
        const placeholders = columns.map((_, idx) => `$${idx + 1}`).join(", ");
        const colList = columns.map((c) => quoteIdentifier(c)).join(", ");
        await pool.query(
          `insert into employee_master (${colList}) values (${placeholders})`,
          values,
        );
        created++;
        results.push({ row: i + 2, status: "created", message: "OK" });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        results.push({ row: i + 2, status: "error", message: msg });
        skipped++;
      }
    }

    return NextResponse.json({
      total: rawRows.length,
      created,
      skipped,
      results,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
