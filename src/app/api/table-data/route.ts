import { NextResponse } from "next/server";
import {
  createTableRow,
  deleteTableRow,
  getRelatedTables,
  getTableDetails,
  getTableRow,
  listDesignationRowsByDepartment,
  listEmployeeLookupRows,
  listShiftPolicyRowsByLocation,
  listSubLocationRowsByParentEntity,
  listTableRows,
  updateTableRow,
  writeAuditLog,
} from "@/lib/table-access";

function getTableFromRequest(request: Request) {
  const { searchParams } = new URL(request.url);
  const table = searchParams.get("table")?.trim();

  if (!table) {
    throw new Error("Missing table parameter");
  }

  return { table, searchParams };
}

export async function GET(request: Request) {
  try {
    const { table, searchParams } = getTableFromRequest(request);
    const limit = Number(searchParams.get("limit") ?? 25);
    const offset = Number(searchParams.get("offset") ?? 0);
    const purpose = searchParams.get("purpose");
    const parentEntityId = searchParams.get("parentEntityId")?.trim();
    

    if (table === "employee_master" && (purpose === "area_manager" || purpose === "keyholder" || purpose === "reporting_manager")) {
      const locationId = searchParams.get("locationId")?.trim() || undefined;
      const snapshot = await listEmployeeLookupRows(purpose, Number.isNaN(limit) ? 500 : limit, Number.isNaN(offset) ? 0 : offset, locationId);
      const details = getTableDetails(table);

      return NextResponse.json({
        ...details,
        rows: snapshot.rows,
        total: snapshot.total,
        relatedTables: getRelatedTables(table),
        columns: details.table.columns,
        foreignKeys: details.table.foreign_keys,
      });
    }

    if (table === "sub_location" && parentEntityId) {
      const snapshot = await listSubLocationRowsByParentEntity(parentEntityId, Number.isNaN(limit) ? 25 : limit, Number.isNaN(offset) ? 0 : offset);
      const details = getTableDetails(table);

      return NextResponse.json({
        ...details,
        rows: snapshot.rows,
        total: snapshot.total,
        relatedTables: getRelatedTables(table),
        columns: snapshot.table.columns,
        foreignKeys: snapshot.table.foreign_keys,
      });
    }

    if (table === "designation_master") {
      const departmentId = searchParams.get("departmentId")?.trim();
      if (departmentId) {
        const snapshot = await listDesignationRowsByDepartment(departmentId, Number.isNaN(limit) ? 500 : limit, Number.isNaN(offset) ? 0 : offset);
        const details = getTableDetails(table);

        return NextResponse.json({
          ...details,
          rows: snapshot.rows,
          total: snapshot.total,
          relatedTables: getRelatedTables(table),
          columns: details.table.columns,
          foreignKeys: details.table.foreign_keys,
        });
      }
    }

    if (table === "shift_policy_master") {
      const locationId = searchParams.get("locationId")?.trim();
      if (locationId) {
        const snapshot = await listShiftPolicyRowsByLocation(locationId, Number.isNaN(limit) ? 500 : limit, Number.isNaN(offset) ? 0 : offset);
        const details = getTableDetails(table);

        return NextResponse.json({
          ...details,
          rows: snapshot.rows,
          total: snapshot.total,
          relatedTables: getRelatedTables(table),
          columns: details.table.columns,
          foreignKeys: details.table.foreign_keys,
        });
      }
    }

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

export async function POST(request: Request) {
  try {
    const { table } = getTableFromRequest(request);
    const payload = await request.json();
    const row = await createTableRow(table, payload);
    writeAuditLog(table, "CREATE", null, row).catch(() => {});
    return NextResponse.json({ row }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create record";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { table } = getTableFromRequest(request);
    const payload = await request.json() as { recordId?: string } & Record<string, unknown>;
    const recordId = payload.recordId;

    if (!recordId) {
      return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
    }

    const { recordId: _recordId, ...rowPayload } = payload;
    const oldRow = await getTableRow(table, recordId);
    const row = await updateTableRow(table, recordId, rowPayload);

    if (!row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    writeAuditLog(table, "UPDATE", oldRow, row).catch(() => {});

    return NextResponse.json({ row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to update record";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { table } = getTableFromRequest(request);
    const payload = await request.json().catch(() => ({} as { recordId?: string }));
    const recordId = payload.recordId;

    if (!recordId) {
      return NextResponse.json({ error: "Missing recordId" }, { status: 400 });
    }

    const oldRow = await getTableRow(table, recordId);
    const row = await deleteTableRow(table, recordId);

    if (!row) {
      return NextResponse.json({ error: "Record not found" }, { status: 404 });
    }

    writeAuditLog(table, "DELETE", oldRow, null).catch(() => {});

    return NextResponse.json({ row });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete record";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}