import { NextResponse } from "next/server";
import { deleteTableRow, updateTableRow } from "@/lib/table-access";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ table: string; recordId: string }> },
) {
  try {
    const { table, recordId } = await params;
    const payload = await request.json();
    const row = await updateTableRow(table, recordId, payload);

    if (!row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json({ row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update record";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ table: string; recordId: string }> },
) {
  try {
    const { table, recordId } = await params;
    const row = await deleteTableRow(table, recordId);

    if (!row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    return NextResponse.json({ row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete record";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
