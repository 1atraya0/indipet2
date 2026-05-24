import { pool, quoteIdentifier } from "@/lib/db";
import {
  allTables,
  formatLabel,
  getFieldKind,
  getPrimaryKey,
  tableLookup,
  type ColumnDefinition,
  type TableDefinition,
} from "@/lib/portal-schema";

export type RecordPayload = Record<string, unknown>;

function getTable(tableName: string): TableDefinition {
  const table = tableLookup[tableName];
  if (!table) {
    throw new Error(`Unknown table: ${tableName}`);
  }

  return table;
}

function normalizeValue(column: ColumnDefinition, value: unknown) {
  if (value === undefined) {
    return undefined;
  }

  if (value === null || value === "") {
    return null;
  }

  const kind = getFieldKind(column);

  if (kind === "checkbox") {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") return ["true", "1", "on", "yes"].includes(value.toLowerCase());
    return Boolean(value);
  }

  if (kind === "number") {
    if (typeof value === "number") return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? null : parsed;
  }

  if (kind === "json") {
    if (typeof value === "string") {
      try {
        return JSON.parse(value);
      } catch {
        return null;
      }
    }
    return value;
  }

  if (kind === "date" || kind === "time" || kind === "datetime") {
    return String(value);
  }

  return String(value);
}

function normalizeRecordInput(table: TableDefinition, input: RecordPayload) {
  const normalized: Record<string, unknown> = {};

  for (const column of table.columns) {
    if (!(column.column in input)) continue;
    const value = normalizeValue(column, input[column.column]);
    if (value !== undefined) {
      normalized[column.column] = value;
    }
  }

  return normalized;
}

function getOrderColumn(table: TableDefinition) {
  return getPrimaryKey(table) ?? table.columns[0]?.column ?? "";
}

function buildWhereClause(table: TableDefinition, recordId: string) {
  const primaryKey = getPrimaryKey(table);
  if (!primaryKey) {
    throw new Error(`Table ${table.table_name} does not have a primary key`);
  }

  const pkColumn = table.columns.find((column) => column.column === primaryKey);
  const value = normalizeValue(pkColumn ?? table.columns[0], recordId);

  return {
    where: `${quoteIdentifier(primaryKey)} = $1`,
    values: [value],
  };
}

export async function listTableRows(tableName: string, limit = 25, offset = 0) {
  const table = getTable(tableName);
  const orderColumn = getOrderColumn(table);
  const rowsResult = await pool.query(
    `select * from ${quoteIdentifier(table.table_name)} order by ${quoteIdentifier(orderColumn)} desc limit $1 offset $2`,
    [limit, offset],
  );
  const countResult = await pool.query(`select count(*)::int as count from ${quoteIdentifier(table.table_name)}`);

  return {
    table,
    rows: rowsResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}

export async function getTableOverview() {
  const counts = await Promise.all(
    allTables.map(async (table) => {
      const result = await pool.query(`select count(*)::int as count from ${quoteIdentifier(table.table_name)}`);
      return {
        table_name: table.table_name,
        count: Number(result.rows[0]?.count ?? 0),
      };
    }),
  );

  return counts;
}

export async function createTableRow(tableName: string, input: RecordPayload) {
  const table = getTable(tableName);
  const payload = normalizeRecordInput(table, input);
  const columns = Object.keys(payload);

  if (columns.length === 0) {
    throw new Error(`No valid values were provided for ${table.table_name}`);
  }

  const values = columns.map((column) => payload[column]);
  const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
  const columnList = columns.map((column) => quoteIdentifier(column)).join(", ");
  const result = await pool.query(
    `insert into ${quoteIdentifier(table.table_name)} (${columnList}) values (${placeholders}) returning *`,
    values,
  );

  return result.rows[0];
}

export async function updateTableRow(tableName: string, recordId: string, input: RecordPayload) {
  const table = getTable(tableName);
  const payload = normalizeRecordInput(table, input);
  const columns = Object.keys(payload);

  if (columns.length === 0) {
    throw new Error(`No valid values were provided for ${table.table_name}`);
  }

  const assignments = columns.map((column, index) => `${quoteIdentifier(column)} = $${index + 1}`);
  const values = columns.map((column) => payload[column]);
  const where = buildWhereClause(table, recordId);

  const result = await pool.query(
    `update ${quoteIdentifier(table.table_name)} set ${assignments.join(", ")} where ${where.where} returning *`,
    [...values, ...where.values],
  );

  return result.rows[0] ?? null;
}

export async function deleteTableRow(tableName: string, recordId: string) {
  const table = getTable(tableName);
  const where = buildWhereClause(table, recordId);
  const result = await pool.query(
    `delete from ${quoteIdentifier(table.table_name)} where ${where.where} returning *`,
    where.values,
  );

  return result.rows[0] ?? null;
}

export function getTableDetails(tableName: string) {
  const table = getTable(tableName);
  return {
    table,
    label: formatLabel(table.table_name),
    primaryKey: getPrimaryKey(table),
  };
}

export function isSupportedTable(tableName: string) {
  return tableName in tableLookup;
}

export function getRelatedTables(tableName: string) {
  const table = getTable(tableName);
  return table.foreign_keys.map((foreignKey) => ({
    ...foreignKey,
    referenced: tableLookup[foreignKey.references_table],
  }));
}

export async function listEmployeeLookupRows(_purpose: string, limit = 500, offset = 0) {
  const table = getTable("employee_master");
  const orderColumn = table.columns.some((column) => column.column === "employee_code")
    ? "employee_code"
    : getOrderColumn(table);

  const rowsResult = await pool.query(
    `select * from ${quoteIdentifier(table.table_name)} where coalesce(${quoteIdentifier("status")}, '') ilike 'active%' order by ${quoteIdentifier(orderColumn)} asc limit $1 offset $2`,
    [limit, offset],
  );
  const countResult = await pool.query(
    `select count(*)::int as count from ${quoteIdentifier(table.table_name)} where coalesce(${quoteIdentifier("status")}, '') ilike 'active%'`,
  );

  return {
    table,
    rows: rowsResult.rows,
    total: Number(countResult.rows[0]?.count ?? 0),
  };
}
