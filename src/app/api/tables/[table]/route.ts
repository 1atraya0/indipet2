import { NextResponse } from "next/server";
import { createTableRow, getRelatedTables, getTableDetails, listTableRows } from "@/lib/table-access";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ table: string }> },
) {
  try {
    const { table } = await params;
    const { searchParams } = new URL(request.url);
    const limit = Number(searchParams.get("limit") ?? 25);
    const offset = Number(searchParams.get("offset") ?? 0);
    const snapshot = await listTableRows(table, Number.isNaN(limit) ? 25 : limit, Number.isNaN(offset) ? 0 : offset);
    const details = getTableDetails(table);

    return NextResponse.json({
      ...details,
      rows: snapshot.rows,
      total: snapshot.total,
      relatedTables: getRelatedTables(table),
      columns: snapshot.table.columns,
      foreignKeys: snapshot.table.foreign_keys,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load table data";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ table: string }> },
) {
  try {
    const { table } = await params;
    const payload = await request.json();
    const row = await createTableRow(table, payload);
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create record";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
