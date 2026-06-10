"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, startTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import {
  allTables,
  countVisibleFields,
  formatLabel,
  formatTypeLabel,
  getFieldKind,
  getTableDisplayColumn,
  portalSections,
  shouldShowInCreateForm,
  tableLookup,
  type ColumnDefinition,
  type TableDefinition,
} from "@/lib/portal-schema";
import { isHighPowerAction } from "@/lib/grade-policy";

const visiblePortalTableNames = new Set(portalSections.flatMap((section) => section.tables));
const visiblePortalTables = allTables.filter((table) => visiblePortalTableNames.has(table.table_name));
const initialVisibleTableName = portalSections[0]?.tables[0] ?? visiblePortalTables[0]?.table_name ?? allTables[0]?.table_name ?? "";

// ─── types ───────────────────────────────────────────────────────────────────

type TableSnapshot = {
  label: string;
  primaryKey: string | null;
  rows: Record<string, unknown>[];
  total: number;
  columns: ColumnDefinition[];
  foreignKeys: Array<{ column: string; references_table: string; references_column: string }>;
  relatedTables: Array<{ column: string; references_table: string; references_column: string }>;
};

type FormState = Record<string, string | boolean>;
type FkOption = { value: string; label: string };
type GeoCountry = { name: string; iso2: string; phonecode: string; currency: string };
type GeoState = { name: string; iso2: string };
type GeoCity = { name: string };
type Mode = "create" | "edit";
type FilterRule = { id: string; column: string; operator: string; value: string };
type PermissionMatrix = Record<string, Record<string, Record<string, boolean>>>;

// ─── employee category mapping ───────────────────────────────────────────────

const EMPLOYEE_CATEGORY_MAP: Record<string, string> = {
  RETAIL:     "RET",
  GROOMING:   "GRO",
  MEDICAL:    "MED",
  BOARDING:   "BOA",
  TRAINING:   "TRA",
  DELIVERY:   "DEL",
  MEMBERSHIP: "MEM",
};
const EMPLOYEE_CATEGORY_BY_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(EMPLOYEE_CATEGORY_MAP).map(([name, code]) => [code, name]),
);

// ─── static enum options ─────────────────────────────────────────────────────

const STATIC_ENUM_OPTIONS: Record<string, string[]> = {
  status: ["active", "inactive"],
  gender: ["Male", "Female", "Other"],
  employee_type: ["full_time", "part_time", "contractor", "intern"],
  employment_subtype: ["permanent", "probation", "contractual", "apprentice"],
  exit_type: ["resignation", "termination", "retirement", "absconding"],
  shift_preference_mode: ["fixed", "rotational", "flexible"],
  preference_type: ["morning", "evening", "night", "flexible"],
  shift_type: ["fixed", "rotational", "split", "flexi"],
  coverage_mode: ["single", "dual", "multi"],
  roster_cycle: ["weekly", "biweekly", "monthly"],
  weekly_off_pattern: ["fixed", "rotational"],
  scope: ["national", "state", "location"],
  calendar_source: ["gregorian", "custom"],
  approval_mode: ["auto", "manual", "manager"],
  accrual_type: ["monthly", "quarterly", "annual", "upfront"],
  gender_restriction: ["none", "male", "female"],
  applicable_to: ["all", "male", "female", "permanent", "contractual"],
  assignment_level: ["organization", "location", "department", "designation", "employee"],
  override_direction: ["increase", "decrease"],
  override_grade_code: ["A", "B", "C", "D"],
  entity_role: ["hq", "company_owned", "franchisee"],
  slot_type: ["regular", "split", "overtime"],
  slot_status: ["scheduled", "confirmed", "cancelled"],
  roster_status: ["draft", "published", "archived"],
  final_status: ["present", "absent", "half_day", "on_leave", "holiday", "weekly_off"],
  onboarding_status: ["pending", "in_progress", "completed"],
  policy_status: ["active", "inactive", "draft"],
  location_type: ["store", "warehouse", "office", "hub"],
  entity_type: ["company", "llp", "partnership", "proprietorship"],
  gst_type: ["regular", "composite", "exempt"],
  document_type: ["aadhar", "pan", "passport", "dl", "voter_id", "other"],
  fulfillment_type: ["delivery", "pickup", "both"],
  holiday_working_policy: ["co_credit", "extra_pay", "none"],
  severity: ["info", "warning", "error", "critical"],
  co_type: ["weekly_off_working", "holiday_working"],
  co_credit_trigger: ["attendance", "manual"],
  grade_code: ["A", "B", "C", "D"],
  category_code: Object.values(EMPLOYEE_CATEGORY_MAP),
  country: ["India", "USA", "UK", "UAE", "Singapore", "Other"],
  state: [
    "Andhra Pradesh", "Arunachal Pradesh", "Assam", "Bihar", "Chhattisgarh",
    "Goa", "Gujarat", "Haryana", "Himachal Pradesh", "Jharkhand", "Karnataka",
    "Kerala", "Madhya Pradesh", "Maharashtra", "Manipur", "Meghalaya", "Mizoram",
    "Nagaland", "Odisha", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu",
    "Telangana", "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
    "Delhi", "Jammu and Kashmir", "Ladakh", "Chandigarh", "Puducherry",
  ],
};

const PERMISSION_ACTIONS = [
  "View",
  "Create",
  "Edit",
  "Delete",
  "Approve",
  "Export",
  "Run Payroll",
  "Correct Attendance",
] as const;

const PERMISSION_MODULES = [
  {
    name: "Employee Management",
    submodules: ["Employee Master", "Employee Finance", "Employee Skills"],
  },
  {
    name: "Leave & Attendance",
    submodules: ["Leave Applications", "Attendance Correction", "CO Ledger"],
  },
  {
    name: "Shift & Roster",
    submodules: ["Shift Policy", "Roster", "Roster History"],
  },
  {
    name: "Payroll & Compliance",
    submodules: ["Salary Structure", "Payroll Run", "PT / Minimum Wage"],
  },
  {
    name: "Exit & Audit",
    submodules: ["Exit Workflow", "FnF Settlement", "Audit Log"],
  },
  {
    name: "Organization Setup",
    submodules: ["State Master", "Parent Entity", "Sub Location"],
  },
] as const;

// ─── filter operators ─────────────────────────────────────────────────────────

const OPERATORS = [
  { value: "contains",     label: "contains" },
  { value: "equals",       label: "= equals" },
  { value: "not_equals",   label: "≠ not equals" },
  { value: "starts_with",  label: "starts with" },
  { value: "ends_with",    label: "ends with" },
  { value: "gt",           label: "> greater than" },
  { value: "lt",           label: "< less than" },
  { value: "is_empty",     label: "is empty" },
  { value: "is_not_empty", label: "is not empty" },
] as const;

const OPERATOR_LABEL: Record<string, string> = Object.fromEntries(OPERATORS.map((o) => [o.value, o.label]));

// ─── animation variants ───────────────────────────────────────────────────────

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

const MODAL_OVERLAY = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.18 } },
  exit:    { opacity: 0, transition: { duration: 0.14 } },
};

const MODAL_CARD = {
  initial: { opacity: 0, scale: 0.97, y: 22 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
  exit:    { opacity: 0, scale: 0.97, y: 10, transition: { duration: 0.16 } },
};

const SECTION_CONTENT = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: "auto", transition: { duration: 0.26, ease: EASE_OUT } },
  exit:    { opacity: 0, height: 0, transition: { duration: 0.18, ease: [0.4, 0, 1, 1] as const } },
};

const STAGGER_PARENT = {
  animate: { transition: { staggerChildren: 0.045 } },
};

const STAGGER_ITEM = {
  initial: { opacity: 0, x: -10 },
  animate: { opacity: 1, x: 0, transition: { duration: 0.22, ease: EASE_OUT } },
};

const FIELD_STAGGER_PARENT = {
  animate: { transition: { staggerChildren: 0.03 } },
};

const FIELD_ITEM = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE_OUT } },
};

const TABLE_SWITCH = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.26, ease: EASE_OUT } },
  exit:    { opacity: 0, y: -8, transition: { duration: 0.16 } },
};

// ─── helpers ─────────────────────────────────────────────────────────────────

const initialSnapshot: TableSnapshot = {
  label: "", primaryKey: null, rows: [], total: 0,
  columns: [], foreignKeys: [], relatedTables: [],
};

function makeBlankForm(table: TableDefinition) {
  return table.columns.reduce<FormState>((s, col) => {
    s[col.column] = getFieldKind(col) === "checkbox" ? false : "";
    return s;
  }, {});
}

function makeEditForm(table: TableDefinition, row: Record<string, unknown>) {
  return table.columns.reduce<FormState>((s, col) => {
    const v = row[col.column];
    s[col.column] = getFieldKind(col) === "checkbox"
      ? Boolean(v)
      : (v === null || v === undefined ? "" : String(v));
    return s;
  }, {});
}

function formatEmployeeLookupLabel(row: Record<string, unknown>) {
  const employeeCode = String(row.employee_code ?? row.employee_id ?? "").trim();
  const nameParts = [row.first_name, row.last_name].filter(Boolean).map(String).join(" ").trim();
  const designation = String(row.designation_name ?? row.role_name ?? "").trim();

  const segments = [employeeCode, nameParts].filter(Boolean);
  const label = segments.join(" - ");

  if (designation) {
    return label ? `${label} (${designation})` : designation;
  }

  return label || String(row.employee_id ?? "");
}

function formatDepartmentLookupLabel(row: Record<string, unknown>) {
  const name = String(row.department_name ?? "").trim();
  const shortCode = String(row.department_short_code ?? row.department_code ?? "").trim();
  if (name && shortCode) return `${name} - ${shortCode}`;
  return name || shortCode || String(row.department_id ?? "");
}

function formatCellValue(column: ColumnDefinition, value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  const kind = getFieldKind(column);
  if (kind === "checkbox") return value ? "Yes" : "No";
  if (kind === "json") return typeof value === "string" ? value : JSON.stringify(value);
  return String(value);
}

function toInputValue(column: ColumnDefinition, value: string | boolean) {
  return getFieldKind(column) === "checkbox" ? Boolean(value) : value;
}

function isLockedGeneratedField(tableName: string, columnName: string) {
  if (tableName === "employee_master" && columnName === "employee_code") {
    return true;
  }

  if (tableName === "parent_entity" && columnName === "entity_code") {
    return true;
  }

  if (tableName === "department_master") {
    return ["department_code", "revenue_centre_code"].includes(columnName);
  }

  if (tableName === "role_master") {
    return columnName === "role_code";
  }

  if (tableName === "employee_category_master" && columnName === "category_code") {
    return true;
  }

  if (tableName === "sub_location" && columnName === "location_code") {
    return true;
  }

  if (tableName === "leave_policy_master" && columnName === "policy_code") {
    return true;
  }

  if (tableName === "policy_variant" && columnName === "variant_code") {
    return true;
  }

  if (tableName === "roster" && columnName === "available_staff_count") {
    return true;
  }

  return false;
}

function normalizeDepartmentShortCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z]/g, "").slice(0, 3);
}

function normalizeDateTime(v: string) {
  if (!v) return "";
  if (v.includes("T")) return v.slice(0, 16);
  return v.replace(" ", "T").slice(0, 16);
}
function normalizeDate(v: string) { return v ? v.slice(0, 10) : ""; }
function normalizeTime(v: string) { return v ? v.slice(0, 5) : ""; }

function getGeoStateCode(stateName: string, geoStates: GeoState[]) {
  const normalizedStateName = String(stateName ?? "").trim();
  if (!normalizedStateName) return "";

  return geoStates.find((state) => state.name === normalizedStateName)?.iso2 ?? "";
}

function getAddressGeoInfo(columnName: string) {
  const match = columnName.match(/^(present|permanent)_(country|country_code|state|state_code|city)$/);
  if (!match) return null;

  return {
    prefix: match[1] as "present" | "permanent",
    kind: match[2] as "country" | "country_code" | "state" | "state_code" | "city",
  };
}

function getFormFieldPriority(tableName: string, columnName: string) {
  const geoPriority: Record<string, number> = {
    country: 100,
    country_code: 100,
    state: 110,
    state_code: 110,
    city: 120,
  };

  const parentEntityPriority: Record<string, number> = {
    legal_name: 10,
    entity_type: 20,
    entity_role: 30,
    gstin: 40,
    gst_type: 50,
    pan_number: 60,
    cin_number: 70,
    phone: 80,
    email: 90,
    address_line1: 100,
    address_line2: 110,
    pincode: 130,
    commission_on_products: 140,
    commission_on_services: 150,
    status: 160,
  };

  const employeeAddressPriority: Record<string, number> = {
    employee_id: 10,
    same_address: 20,
    present_country: 30,
    present_state: 40,
    present_city: 50,
    present_pincode: 60,
    present_address_line1: 70,
    present_address_line2: 80,
    permanent_country: 90,
    permanent_state: 100,
    permanent_city: 110,
    permanent_pincode: 120,
    permanent_address_line1: 130,
    permanent_address_line2: 140,
    status: 200,
  };

  const employeePriority: Record<string, number> = {
    parent_entity_id: 10,
    location_id: 20,
    department_id: 30,
    designation_id: 40,
    role_id: 50,
    reporting_manager_id: 60,
    employee_category: 70,
    date_of_joining: 80,
    original_doj: 90,
    login_id: 100,
    shift_preference_mode: 110,
    default_shift_id: 120,
    status: 200,
  };

  const subLocationPriority: Record<string, number> = {
    parent_entity_id: 10,
    location_name: 20,
    location_type: 30,
    country: 100,
    state: 110,
    city: 120,
    pincode: 130,
    status: 200,
  };

  const tableSpecificPriority: Record<string, Record<string, number>> = {
    parent_entity: parentEntityPriority,
    employee_address: employeeAddressPriority,
    employee_master: employeePriority,
    sub_location: subLocationPriority,
  };

  return tableSpecificPriority[tableName]?.[columnName] ?? geoPriority[columnName] ?? 1000;
}

function compareFormFields(tableName: string, left: ColumnDefinition, right: ColumnDefinition, leftIndex: number, rightIndex: number) {
  const leftPriority = getFormFieldPriority(tableName, left.column);
  const rightPriority = getFormFieldPriority(tableName, right.column);

  if (leftPriority !== rightPriority) {
    return leftPriority - rightPriority;
  }

  return leftIndex - rightIndex;
}

function parseGstin(gstin: string) {
  const normalized = gstin.trim().toUpperCase();
  if (!/^[0-9A-Z]{15}$/.test(normalized)) return null;

  const panNumber = normalized.slice(2, 12);
  const taxpayerTypeCode = panNumber[3];
  const entityTypeMap: Record<string, string> = {
    C: "company",
    F: "partnership",
    P: "proprietorship",
  };

  return {
    panNumber,
    entityType: entityTypeMap[taxpayerTypeCode] ?? "",
  };
}

function inputValueForField(column: ColumnDefinition, value: string | boolean) {
  const kind = getFieldKind(column);
  if (kind === "datetime") return normalizeDateTime(String(value));
  if (kind === "date") return normalizeDate(String(value));
  if (kind === "time") return normalizeTime(String(value));
  return value;
}

function normalizeRoleCode(value: string) {
  const normalized = value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!normalized) return "";
  return `ROLE-${normalized}`;
}

function createEmptyPermissionMatrix(): PermissionMatrix {
  return PERMISSION_MODULES.reduce<PermissionMatrix>((modules, module) => {
    modules[module.name] = module.submodules.reduce<Record<string, Record<string, boolean>>>((submodules, submodule) => {
      submodules[submodule] = PERMISSION_ACTIONS.reduce<Record<string, boolean>>((actions, action) => {
        actions[action] = false;
        return actions;
      }, {});
      return submodules;
    }, {});
    return modules;
  }, {});
}

function toPermissionMatrix(value: unknown) {
  if (!value || typeof value !== "object") return createEmptyPermissionMatrix();

  const source = value as Record<string, Record<string, Record<string, unknown>>>;
  const matrix = createEmptyPermissionMatrix();

  for (const module of PERMISSION_MODULES) {
    const sourceModule = source[module.name];
    if (!sourceModule) continue;

    for (const submodule of module.submodules) {
      const sourceSubmodule = sourceModule[submodule];
      if (!sourceSubmodule) continue;

      for (const action of PERMISSION_ACTIONS) {
        if (typeof sourceSubmodule[action] === "boolean") {
          matrix[module.name][submodule][action] = sourceSubmodule[action] as boolean;
        }
      }
    }
  }

  return matrix;
}

function stringifyPermissionMatrix(matrix: PermissionMatrix) {
  return JSON.stringify(matrix, null, 2);
}

function buildTableSearch(row: Record<string, unknown>) {
  return Object.values(row)
    .flatMap((v) => {
      if (v === null || v === undefined) return [];
      return [typeof v === "object" ? JSON.stringify(v) : String(v)];
    })
    .join(" ")
    .toLowerCase();
}

// ─── component ───────────────────────────────────────────────────────────────

export function AdminPortal() {
  // All hooks must come before any conditional return (React rules)
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlInitRef = useRef(false);

  const [activeTableName, setActiveTableName] = useState(initialVisibleTableName);
  const [openSection, setOpenSection]         = useState(portalSections[0]?.title ?? "");
  const [snapshot, setSnapshot]               = useState<TableSnapshot>(initialSnapshot);
  const [loading, setLoading]                 = useState(true);
  const [error, setError]                     = useState<string | null>(null);
  const [search, setSearch]                   = useState("");
  const [mode, setMode]                       = useState<Mode>("create");
  const [formOpen, setFormOpen]               = useState(false);
  const [formState, setFormState]             = useState<FormState>({});
  const [currentRowId, setCurrentRowId]       = useState<string | null>(null);
  const [submitting, setSubmitting]           = useState(false);
  const [deletePrompt, setDeletePrompt]       = useState<string | null>(null);
  const [notice, setNotice]                     = useState<string | null>(null);
  const [employeeCountMap, setEmployeeCountMap] = useState<Record<string, number>>({});
  const [expandedPerms, setExpandedPerms] = useState<Set<string>>(new Set());
  const [fkOptions, setFkOptions]             = useState<Record<string, FkOption[]>>({});
  const [fkLabelMap, setFkLabelMap]           = useState<Record<string, Record<string, string>>>({});
  const [geoCountries, setGeoCountries]       = useState<GeoCountry[]>([]);
  const [geoStates, setGeoStates]             = useState<GeoState[]>([]);
  const [geoCities, setGeoCities]             = useState<GeoCity[]>([]);
  const [presentGeoCities, setPresentGeoCities] = useState<GeoCity[]>([]);
  const [permanentGeoCities, setPermanentGeoCities] = useState<GeoCity[]>([]);
  const [filters, setFilters]                 = useState<FilterRule[]>([]);
  const [filterOpen, setFilterOpen]           = useState(false);
  const [draftCol, setDraftCol]               = useState("");
  const [draftOp, setDraftOp]                 = useState("contains");
  const [draftVal, setDraftVal]               = useState("");
  const lastSelectedStateCodeRef = useRef("");
  const [permissionDraft, setPermissionDraft] = useState<PermissionMatrix>(createEmptyPermissionMatrix());
  const [permissionMode, setPermissionMode]   = useState<"custom" | "template">("custom");
  const [locationDropdownOpen, setLocationDropdownOpen] = useState(false);
  const locationDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!locationDropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target as Node)) {
        setLocationDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [locationDropdownOpen]);

  useEffect(() => {
    const tables = ["shift_policy_master", "roster"];
    if (!tables.includes(activeTableName ?? "")) return;
    const locId = String(formState.location_id ?? "").trim();
    if (!locId) return;

    fetch("/api/table-data?table=location_operating_hours&limit=20")
      .then((r) => r.json())
      .then((data) => {
        const monday = (data.rows ?? []).find(
          (r: Record<string, unknown>) =>
            String(r.location_id) === locId && r.day_of_week === 1,
        );
        if (!monday) return;
        const openTime = (monday.operational_open_time as string)?.substring(0, 5);
        const closeTime = (monday.operational_close_time as string)?.substring(0, 5);
        if (!openTime && !closeTime) return;
        setFormState((prev) => ({
          ...prev,
          ...(activeTableName === "shift_policy_master"
            ? {
                shift_start_time: openTime ?? prev.shift_start_time,
                shift_end_time: closeTime ?? prev.shift_end_time,
              }
            : {
                effective_open_time: openTime ?? prev.effective_open_time,
                effective_close_time: closeTime ?? prev.effective_close_time,
              }),
        }));
      })
      .catch(() => {});

    if (activeTableName === "roster") {
      fetch("/api/table-data?table=employee_master&limit=500")
        .then((r) => r.json())
        .then((data) => {
          const count = (data.rows ?? []).filter(
            (e: Record<string, unknown>) => String(e.location_id) === locId,
          ).length;
          setFormState((prev) => ({
            ...prev,
            available_staff_count: count,
          }));
        })
        .catch(() => {});
    }
  }, [activeTableName, formState.location_id]);

  useEffect(() => {
    if (!notice) return;

    const timer = window.setTimeout(() => setNotice(null), 2500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const deferredSearch = useDeferredValue(search);
  const selectedStateCode = useMemo(() => {
    const stateCode = String(formState.state_code ?? "").trim().toUpperCase();
    if (stateCode) return stateCode;

    const stateName = String(formState.state ?? "").trim();
    if (!stateName) return "";

    return geoStates.find((state) => state.name === stateName)?.iso2 ?? "";
  }, [formState.state, formState.state_code, geoStates]);

  const presentStateCode = useMemo(
    () => getGeoStateCode(String(formState.present_state ?? ""), geoStates),
    [formState.present_state, geoStates],
  );

  const permanentStateCode = useMemo(
    () => getGeoStateCode(String(formState.permanent_state ?? ""), geoStates),
    [formState.permanent_state, geoStates],
  );

  const filteredRows = useMemo(() => {
    let rows = snapshot.rows;
    if (deferredSearch.trim()) {
      const q = deferredSearch.trim().toLowerCase();
      rows = rows.filter((row) => buildTableSearch(row).includes(q));
    }
    for (const f of filters) {
      if (!f.column) continue;
      rows = rows.filter((row) => {
        const cell = row[f.column];
        const cellStr = (cell === null || cell === undefined) ? "" : String(cell).toLowerCase();
        const val = f.value.toLowerCase();
        switch (f.operator) {
          case "contains":     return cellStr.includes(val);
          case "equals":       return cellStr === val;
          case "not_equals":   return cellStr !== val;
          case "starts_with":  return cellStr.startsWith(val);
          case "ends_with":    return cellStr.endsWith(val);
          case "gt":           return Number(cell) > Number(f.value);
          case "lt":           return Number(cell) < Number(f.value);
          case "is_empty":     return cellStr === "";
          case "is_not_empty": return cellStr !== "";
          default:             return true;
        }
      });
    }
    return rows;
  }, [deferredSearch, snapshot.rows, filters]);

  const incomingRelations = useMemo(
    () =>
      visiblePortalTables
        .filter((t) => t.foreign_keys.some((fk) => fk.references_table === activeTableName))
        .flatMap((t) =>
          t.foreign_keys
            .filter((fk) => fk.references_table === activeTableName)
            .map((fk) => ({ table_name: t.table_name, column: fk.column, references_column: fk.references_column })),
        ),
    [activeTableName],
  );


  // Sync URL → state once on mount
  useEffect(() => {
    if (urlInitRef.current) return;
    urlInitRef.current = true;
    const table = searchParams.get("table");
    if (table && visiblePortalTableNames.has(table) && tableLookup[table]) {
      startTransition(() => {
        setActiveTableName(table);
        const section = portalSections.find((s) => s.tables.includes(table));
        if (section) setOpenSection(section.title);
      });
    }
  }, [searchParams]);

  // Fetch table rows
  useEffect(() => {
    if (!activeTableName) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/tables/${activeTableName}?limit=100`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error((body as { error?: string }).error ?? "Failed to load table");
        }
        return res.json() as Promise<TableSnapshot>;
      })
      .then(async (data) => {
        if (cancelled) return;
        setSnapshot(data);

        const refTables = new Map<string, string>();
        for (const rel of data.relatedTables) {
          refTables.set(rel.references_table, rel.column);
        }
        if (refTables.size > 0) {
          const map: Record<string, Record<string, string>> = {};
          await Promise.all(
            Array.from(refTables.entries()).map(async ([refTable, fkColumn]) => {
              try {
                const res = await fetch(`/api/table-data?table=${refTable}&limit=500`);
                if (!res.ok) return;
                const refData = (await res.json()) as TableSnapshot;
                const refDef = tableLookup[refTable];
                const refPk = refData.primaryKey ?? refDef?.primary_key[0] ?? Object.keys(refData.rows[0] ?? {}).find((k) => k.endsWith("_id")) ?? "";
                const lookup: Record<string, string> = {};
                for (const row of refData.rows) {
                  const display = refDef ? getTableDisplayColumn(refDef, row) : String(row[refPk] ?? "");
                  const pkVal = row[refPk];
                  if (pkVal !== null && pkVal !== undefined) {
                    lookup[String(pkVal)] = display;
                  }
                }
                map[fkColumn] = lookup;
              } catch { /* skip */ }
            }),
          );
          if (!cancelled) setFkLabelMap(map);
        }
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load table"); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [activeTableName]);

  // Fetch employee count per location for live roster display
  useEffect(() => {
    if (activeTableName !== "roster") {
      setEmployeeCountMap({});
      return;
    }
    let cancelled = false;
    fetch("/api/table-data?table=employee_master&limit=500")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const map: Record<string, number> = {};
        for (const e of data.rows ?? []) {
          const locId = String(e.location_id ?? "");
          if (locId) map[locId] = (map[locId] ?? 0) + 1;
        }
        setEmployeeCountMap(map);
      })
      .catch(() => { if (!cancelled) setEmployeeCountMap({}); });
    return () => { cancelled = true; };
  }, [activeTableName]);

  // Fetch geo data once
  useEffect(() => {
    Promise.all([
      fetch("/api/geo/countries").then((r) => r.json() as Promise<GeoCountry[]>),
      fetch("/api/geo/states?country=IN").then((r) => r.json() as Promise<GeoState[]>),
    ])
      .then(([countries, states]) => {
        if (Array.isArray(countries)) setGeoCountries(countries);
        if (Array.isArray(states)) setGeoStates(states);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedStateCode) {
      lastSelectedStateCodeRef.current = "";
      setGeoCities([]);
      return;
    }

    const previousStateCode = lastSelectedStateCodeRef.current;
    lastSelectedStateCodeRef.current = selectedStateCode;

    if (previousStateCode && previousStateCode !== selectedStateCode) {
      setFormState((prev) => (prev.city === undefined || prev.city === "" ? prev : { ...prev, city: "" }));
    }

    let cancelled = false;

    fetch(`/api/geo/cities?state=${selectedStateCode}`)
      .then((r) => r.json() as Promise<GeoCity[]>)
      .then((cities) => {
        if (!cancelled && Array.isArray(cities)) {
          setGeoCities(cities);
        }
      })
      .catch(() => {
        if (!cancelled) setGeoCities([]);
      });

    return () => {
      cancelled = true;
    };
  }, [selectedStateCode]);

  useEffect(() => {
    if (!presentStateCode) {
      setPresentGeoCities([]);
      return;
    }

    let cancelled = false;

    fetch(`/api/geo/cities?state=${presentStateCode}`)
      .then((r) => r.json() as Promise<GeoCity[]>)
      .then((cities) => {
        if (!cancelled && Array.isArray(cities)) {
          setPresentGeoCities(cities);
        }
      })
      .catch(() => {
        if (!cancelled) setPresentGeoCities([]);
      });

    return () => {
      cancelled = true;
    };
  }, [presentStateCode]);

  useEffect(() => {
    if (!permanentStateCode) {
      setPermanentGeoCities([]);
      return;
    }

    let cancelled = false;

    fetch(`/api/geo/cities?state=${permanentStateCode}`)
      .then((r) => r.json() as Promise<GeoCity[]>)
      .then((cities) => {
        if (!cancelled && Array.isArray(cities)) {
          setPermanentGeoCities(cities);
        }
      })
      .catch(() => {
        if (!cancelled) setPermanentGeoCities([]);
      });

    return () => {
      cancelled = true;
    };
  }, [permanentStateCode]);

  useEffect(() => {
    if (activeTableName !== "parent_entity") return;

    const gstinValue = String(formState.gstin ?? "").trim();
    const parsed = parseGstin(gstinValue);
    if (!parsed) return;

    setFormState((prev) => {
      let nextState = prev;

      if (prev.pan_number !== parsed.panNumber) {
        nextState = { ...nextState, pan_number: parsed.panNumber };
      }

      if (parsed.entityType && prev.entity_type !== parsed.entityType) {
        nextState = { ...nextState, entity_type: parsed.entityType };
      }

      return nextState;
    });
  }, [activeTableName, formState.gstin]);

  // ── guard (after all hooks) ───────────────────────────────────────────────
  const activeTable = tableLookup[activeTableName];
  const activeTableConfig = activeTable ?? visiblePortalTables[0];
  if (!activeTableConfig) return null;

  const buildTableApiUrl = (tableName: string, params: Record<string, string | number | undefined> = {}) => {
    const searchParams = new URLSearchParams({ table: tableName });
    for (const [key, value] of Object.entries(params)) {
      if (value === undefined) continue;
      searchParams.set(key, String(value));
    }
    return `/api/table-data?${searchParams.toString()}`;
  };

  const visibleColumns   = activeTableConfig.columns;
  const tableColumns = visibleColumns.filter((col) => !col.default?.includes("nextval"));
  const outgoingRelations = snapshot.relatedTables;
  const formColumns = visibleColumns
    .filter((column) => shouldShowInCreateForm(column, activeTableConfig.table_name))
    .map((column, index) => ({ column, index }))
    .sort((left, right) => compareFormFields(activeTableConfig.table_name, left.column, right.column, left.index, right.index))
    .map((entry) => entry.column);

  // ── handlers ─────────────────────────────────────────────────────────────

  const loadFkOptions = async (table: TableDefinition) => {
    if (table.foreign_keys.length === 0) { setFkOptions({}); return; }

    const grouped = new Map<string, typeof table.foreign_keys>();
    for (const fk of table.foreign_keys) {
      grouped.set(fk.references_table, [...(grouped.get(fk.references_table) ?? []), fk]);
    }

    const results: Record<string, FkOption[]> = {};
    await Promise.all(
      Array.from(grouped.entries()).map(async ([refName, fks]) => {
        try {
          const refDef = tableLookup[refName];

          if (refName === "employee_master") {
            const purposeForColumn = (column: string) => {
              if (column === "area_manager_id") return "area_manager";
              if (column === "primary_keyholder_id" || column === "backup_keyholder_id") return "keyholder";
              return null;
            };

            const purposes = Array.from(new Set(fks.map((fk) => purposeForColumn(fk.column)).filter(Boolean) as string[]));
            const purposeRows = new Map<string, Record<string, unknown>[]>();

            await Promise.all(
              purposes.map(async (purpose) => {
                const res = await fetch(buildTableApiUrl("employee_master", { limit: 500, purpose }));
                if (!res.ok) return;
                const data = (await res.json()) as { rows: Record<string, unknown>[] };
                purposeRows.set(purpose, data.rows);
              }),
            );

            for (const fk of fks) {
              const purpose = purposeForColumn(fk.column);
              const rows = purpose ? (purposeRows.get(purpose) ?? []) : [];
              results[fk.column] = rows.map((row) => ({
                value: String(row[fk.references_column] ?? ""),
                label: formatEmployeeLookupLabel(row),
              }));
            }
            return;
          }

          if (refName === "sub_location") {
            const parentEntityId = String(formState.parent_entity_id ?? "").trim();
            const params: Record<string, string | number> = { limit: 500 };
            if (parentEntityId) {
              params.parentEntityId = parentEntityId;
            }

            const res = await fetch(buildTableApiUrl(refName, params));
            if (!res.ok) return;
            const data = (await res.json()) as { rows: Record<string, unknown>[] };

            for (const fk of fks) {
              results[fk.column] = data.rows.map((row) => ({
                value: String(row[fk.references_column] ?? ""),
                label: getTableDisplayColumn(refDef ?? tableLookup.sub_location, row),
              }));
            }
            return;
          }

          const res = await fetch(buildTableApiUrl(refName, { limit: 500 }));
          if (!res.ok) return;
          const data = (await res.json()) as { rows: Record<string, unknown>[] };
          for (const fk of fks) {
            results[fk.column] = data.rows.map((row) => ({
              value: String(row[fk.references_column] ?? ""),
              label:
                refName === "department_master"
                  ? formatDepartmentLookupLabel(row)
                  : refDef
                    ? getTableDisplayColumn(refDef, row)
                    : String(row[fk.references_column] ?? ""),
            }));
          }
        } catch { /* silently skip */ }
      }),
    );
    setFkOptions(results);
  };

  const openCreate = () => {
    if (!activeTable) return;
    setMode("create"); setCurrentRowId(null);
    const nextForm = makeBlankForm(activeTable);
    if (activeTableName === "role_master") {
      nextForm.status = "active";
      nextForm.permissions = stringifyPermissionMatrix(createEmptyPermissionMatrix());
      setPermissionDraft(createEmptyPermissionMatrix());
      setPermissionMode("custom");
    }
    setFormState(nextForm);
    setFormOpen(true);
    loadFkOptions(activeTable).catch(() => {});
  };

  useEffect(() => {
    if (activeTableName !== "employee_master" || !formOpen || !activeTable) return;
    loadFkOptions(activeTable).catch(() => {});
  }, [activeTableName, formOpen, formState.parent_entity_id]);

  const openEdit = (row: Record<string, unknown>) => {
    if (!activeTable) return;
    const pk = snapshot.primaryKey ?? activeTable.primary_key[0] ?? null;
    const id = pk ? row[pk] : null;
    setMode("edit");
    setCurrentRowId(id === null || id === undefined ? null : String(id));
    setFormState(makeEditForm(activeTable, row));
    if (activeTableName === "role_master") {
      setPermissionDraft(toPermissionMatrix(row.permissions));
      setPermissionMode("custom");
    }
    setFormOpen(true);
    loadFkOptions(activeTable).catch(() => {});
  };

  const closeForm = () => {
    setFormOpen(false); setCurrentRowId(null); setSubmitting(false); setFkOptions({});
    if (activeTable) setFormState(makeBlankForm(activeTable));
  };

  const refreshTable = async () => {
    const res = await fetch(buildTableApiUrl(activeTableName, { limit: 100 }), { cache: "no-store" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error ?? "Failed to refresh table");
    }
    setSnapshot(await res.json() as TableSnapshot);
  };

  const submitRecord = async () => {
    if (!activeTable) return;

    if (activeTableName === "employee_master") {
      if (!String(formState.parent_entity_id ?? "").trim()) {
        setError("parent_entity_id is required for employee_code generation");
        return;
      }

      if (!String(formState.location_id ?? "").trim()) {
        setError("location_id is required for employee_code generation");
        return;
      }
    }

    if (activeTableName === "role_master") {
      const roleName = String(formState.role_name ?? "").trim();
      if (!roleName) {
        setError("role_name is required");
        return;
      }
      if (!String(formState.role_code ?? "").trim()) {
        setFormState((prev) => ({ ...prev, role_code: normalizeRoleCode(roleName) }));
      }
    }

    setSubmitting(true);
    try {
      const body = activeTable.columns.reduce<Record<string, string | boolean | null>>((draft, col) => {
        if (mode === "create" && col.default?.includes("nextval(")) {
          return draft;
        }

        if (isLockedGeneratedField(activeTableName, col.column)) {
          return draft;
        }

        if (mode === "edit" && col.column === activeTable.primary_key[0]) {
          return draft;
        }

        const raw = formState[col.column];
        const kind = getFieldKind(col);
        if (kind === "checkbox") {
          draft[col.column] = Boolean(raw);
          return draft;
        }
        if (kind === "number") {
          draft[col.column] = raw === "" ? null : String(raw);
          return draft;
        }
        if (kind === "json" && typeof raw === "string" && !raw.trim()) {
          draft[col.column] = null;
          return draft;
        }

        draft[col.column] = raw;
        return draft;
      }, {});
      const endpoint = buildTableApiUrl(activeTableName);

      if (mode === "create" && activeTableName === "holiday_calendar") {
        const locationRaw = String(body.location_id ?? "");
        const locationIds = locationRaw.split(",").filter(Boolean);

        if (locationIds.length > 1) {
          let createdCount = 0;
          for (const locId of locationIds) {
            const locBody = { ...body, location_id: locId };
            const r = await fetch(endpoint, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(locBody),
            });
            const result = await r.json();
            if (!r.ok) throw new Error((result as { error?: string }).error ?? "Unable to save record");
            createdCount++;
          }
          await refreshTable();
          setError(null);
          setNotice(`${createdCount} records created successfully.`);
          closeForm();
          return;
        }

        if (locationIds.length === 0) {
          delete body.location_id;
        }
      }

      const requestBody = mode === "create"
        ? body
        : { recordId: currentRowId, ...body };
      const res = await fetch(endpoint, {
        method: mode === "create" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const result = await res.json();
      if (!res.ok) throw new Error((result as { error?: string }).error ?? "Unable to save record");
      await refreshTable();
      setError(null);
      setNotice(mode === "create" ? "Record created successfully." : "Record updated successfully.");
      closeForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save record");
      setSubmitting(false);
    }
  };

  const deleteRecord = async (recordId: string) => {
    const pk = snapshot.primaryKey ?? activeTable?.primary_key[0] ?? null;

    try {
      const res = await fetch(buildTableApiUrl(activeTableName), {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error((result as { error?: string }).error ?? "Unable to delete record");

      if (pk) {
        setSnapshot((prev) => {
          const nextRows = prev.rows.filter((row) => String(row[pk]) !== recordId);
          return {
            ...prev,
            rows: nextRows,
            total: Math.max(0, prev.total - 1),
          };
        });
      }

      setDeletePrompt(null);
      setError(null);
      setNotice("Record deleted successfully.");
      await refreshTable();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to delete record");
      setDeletePrompt(null);
    }
  };

  const handleTableSelect = (tableName: string) => {
    startTransition(() => {
      setActiveTableName(tableName);
      setSearch(""); setFormOpen(false); setDeletePrompt(null); setFkOptions({});
      setFilters([]); setFilterOpen(false); setDraftCol(""); setDraftOp("contains"); setDraftVal("");
    });
    router.push(`/?table=${tableName}`, { scroll: false });
  };

  const updateForm = (column: string, value: string | boolean) => {
    setFormState((prev) => {
      const next = { ...prev, [column]: value };

      if (activeTableName === "employee_address") {
        if (column === "same_address" && Boolean(value)) {
          for (const field of [
            "address_line1",
            "address_line2",
            "country",
            "state",
            "city",
            "pincode",
          ]) {
            const presentField = `present_${field}`;
            const permanentField = `permanent_${field}`;
            next[permanentField] = next[presentField] ?? "";
          }
        }

        if (column === "present_country") {
          next.present_state = "";
          next.present_city = "";
          if (Boolean(next.same_address)) {
            next.permanent_country = next.present_country;
            next.permanent_state = "";
            next.permanent_city = "";
          }
        }

        if (column === "permanent_country") {
          next.permanent_state = "";
          next.permanent_city = "";
        }

        if (column.startsWith("present_") && Boolean(next.same_address)) {
          const permanentField = column.replace(/^present_/, "permanent_");
          next[permanentField] = value;
        }

        if (column === "present_state") {
          next.present_city = "";
          if (Boolean(next.same_address)) {
            next.permanent_city = "";
          }
        }

        if (column === "permanent_state") {
          next.permanent_city = "";
        }
      }

      if (activeTableName === "role_master" && column === "role_name") {
        next.role_code = normalizeRoleCode(String(value));
      }

      if (activeTableName === "employee_category_master") {
        if (column === "category_name") {
          next.category_code = EMPLOYEE_CATEGORY_MAP[String(value)] ?? next.category_code;
        } else if (column === "category_code") {
          next.category_name = EMPLOYEE_CATEGORY_BY_CODE[String(value)] ?? next.category_name;
        }
      }

      if (activeTableName === "employee_master" && column === "parent_entity_id") {
        next.location_id = "";
      }

      return next;
    });
  };

  const toggleSection = (title: string) => {
    setOpenSection((prev) => (prev === title ? "" : title));
  };

  const addFilter = () => {
    if (!draftCol) return;
    const needsValue = !["is_empty", "is_not_empty"].includes(draftOp);
    if (needsValue && !draftVal.trim()) return;
    setFilters((prev) => [
      ...prev,
      { id: Math.random().toString(36).slice(2), column: draftCol, operator: draftOp, value: draftVal },
    ]);
    setDraftVal("");
  };

  const removeFilter = (id: string) => setFilters((prev) => prev.filter((f) => f.id !== id));

  useEffect(() => {
    if (activeTableName !== "role_master" || !formOpen) return;

    const nextPermissions = stringifyPermissionMatrix(permissionDraft);
    setFormState((prev) => (prev.permissions === nextPermissions ? prev : { ...prev, permissions: nextPermissions }));
  }, [activeTableName, formOpen, permissionDraft]);

  // ── shared select class ───────────────────────────────────────────────────
  const selectClass = "rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10 cursor-pointer";

  // ── render ────────────────────────────────────────────────────────────────
  return (
    <div className="relative h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(26,79,138,0.12),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(42,125,95,0.12),transparent_40%),linear-gradient(180deg,#fffdf8_0%,#fff9f0_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-48 -top-40 h-120 w-120 rounded-full bg-[#FFD700]/20 blur-3xl" />
        <div className="absolute -right-32 top-56 h-104 w-104 rounded-full bg-[#1A4F8A]/15 blur-3xl" />
        <div className="absolute -bottom-40 left-[18%] h-96 w-96 rounded-full bg-[#2A7D5F]/15 blur-3xl" />
        <div className="absolute inset-0 bg-[linear-gradient(rgba(26,79,138,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(26,79,138,0.04)_1px,transparent_1px)] bg-size-[60px_60px] opacity-50" />
      </div>

      <div className="relative mx-auto flex h-full max-w-480 gap-6 px-4 py-4 lg:px-6">

        {/* ── Sidebar ────────────────────────────────────────────────────── */}
        <aside className="hidden h-full w-82.5 shrink-0 flex-col overflow-y-auto rounded-3xl border border-white/70 bg-white/65 p-5 shadow-[0_24px_80px_rgba(26,79,138,0.12)] backdrop-blur-2xl hide-scrollbar lg:flex">
          <div className="rounded-3xl border border-[#1A4F8A]/15 bg-[linear-gradient(135deg,rgba(26,79,138,0.12),rgba(255,215,0,0.14))] p-5 shadow-inner">
            <p className="text-xs uppercase tracking-[0.36em] text-[#1A4F8A]">Integrated HRMS</p>
            <h1 className="font-display mt-2 text-3xl font-bold leading-none tracking-tight text-slate-950">
              Super Admin Portal
            </h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              Single-pane access to every master, workflow, audit log, and transactional table.
            </p>
          </div>

          <div className="mt-5 space-y-4 overflow-y-auto pr-1 hide-scrollbar">
            {portalSections.map((section) => (
              <div key={section.title} className="rounded-3xl border border-white/70 bg-white/65 p-4 shadow-sm backdrop-blur">
                <button
                  type="button"
                  onClick={() => toggleSection(section.title)}
                  className="flex w-full items-center justify-between gap-3 text-left"
                >
                  <span className="flex items-center gap-3">
                    <span className="h-3 w-3 rounded-full" style={{ backgroundColor: section.accent }} />
                    <span>
                      <span className="block font-semibold text-slate-950">{section.title}</span>
                      <span className="block text-xs leading-5 text-slate-500">{section.description}</span>
                    </span>
                  </span>
                  <motion.span
                    animate={{ rotate: openSection === section.title ? 180 : 0 }}
                    transition={{ duration: 0.22 }}
                    className="rounded-full border border-slate-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500"
                  >
                    {openSection === section.title ? "Hide" : "Show"}
                  </motion.span>
                </button>

                <AnimatePresence initial={false}>
                  {openSection === section.title && (
                    <motion.div
                      key="content"
                      variants={SECTION_CONTENT}
                      initial="initial"
                      animate="animate"
                      exit="exit"
                      className="overflow-hidden"
                    >
                      <motion.div
                        className="mt-4 space-y-2"
                        variants={STAGGER_PARENT}
                        initial="initial"
                        animate="animate"
                      >
                        {section.tables.map((tableName) => {
                          const table = tableLookup[tableName];
                          if (!table) return null;
                          const active = tableName === activeTableName;
                          return (
                            <motion.button
                              key={tableName}
                              variants={STAGGER_ITEM}
                              type="button"
                              onClick={() => handleTableSelect(tableName)}
                              className={`flex w-full items-center justify-between rounded-2xl border px-3 py-3 text-left transition duration-200 ${
                                active
                                  ? "border-[#1A4F8A]/30 bg-[#1A4F8A]/8 shadow-[0_10px_30px_rgba(26,79,138,0.12)]"
                                  : "border-white/75 bg-white/80 hover:border-[#2A7D5F]/20 hover:bg-white"
                              }`}
                            >
                              <span>
                                <span className="block text-sm font-medium text-slate-900">{formatLabel(table.table_name)}</span>
                                <span className="block text-[11px] uppercase tracking-[0.24em] text-slate-500">
                                  {table.primary_key[0] ?? "No primary key"}
                                </span>
                              </span>
                              <span className="rounded-full bg-slate-900 px-2.5 py-1 text-[11px] font-semibold text-white">
                                {table.columns.length}
                              </span>
                            </motion.button>
                          );
                        })}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ))}
          </div>
        </aside>

        {/* ── Main ───────────────────────────────────────────────────────── */}
        <main className="flex h-full min-w-0 flex-1 flex-col gap-6 overflow-y-auto pb-4 hide-scrollbar">
          <header className="relative shrink-0 overflow-clip rounded-4xl border border-white/80 bg-white/70 p-6 shadow-[0_30px_90px_rgba(26,79,138,0.12)] backdrop-blur-2xl lg:p-8">
            <div className="absolute right-6 top-6 h-24 w-24 rounded-full bg-[#FFD700]/15 blur-2xl" />
            <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[#2A7D5F]/12 blur-3xl" />

            <div className="relative flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
              <div className="max-w-3xl">
                <AnimatePresence mode="wait">
                  <motion.p
                    key={activeTableName + "-badge"}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.2 }}
                    className="inline-flex items-center gap-2 rounded-full border border-[#1A4F8A]/15 bg-[#1A4F8A]/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#1A4F8A]"
                  >
                    {snapshot.label || formatLabel(activeTableName)}
                  </motion.p>
                </AnimatePresence>
                <h2 className="font-display mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                  Indipet HRMS
                </h2>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => refreshTable().catch((e) => setError(e instanceof Error ? e.message : "Unable to refresh"))}
                  className="rounded-full border border-[#1A4F8A]/20 bg-white px-5 py-3 text-sm font-semibold text-[#1A4F8A] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                >
                  Refresh table
                </button>
                <button
                  type="button"
                  onClick={openCreate}
                  className="rounded-full bg-[#1A4F8A] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(26,79,138,0.25)] transition hover:-translate-y-0.5 hover:bg-[#173f6b]"
                >
                  New record
                </button>
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div
                key={activeTableName + "-stats"}
                variants={TABLE_SWITCH}
                initial="initial"
                animate="animate"
                exit="exit"
                className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4"
              >
                {[
                  { label: "Rows loaded",    value: snapshot.total,                                       accent: "#1A4F8A" },
                  { label: "Visible fields", value: activeTable ? countVisibleFields(activeTable) : 0,    accent: "#2A7D5F" },
                  { label: "Outgoing links", value: outgoingRelations.length,                             accent: "#FFD700" },
                  { label: "Incoming links", value: incomingRelations.length,                             accent: "#FF6600" },
                ].map((card) => (
                  <div key={card.label} className="rounded-[26px] border border-white/80 bg-white/75 p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.28em] text-slate-500">{card.label}</p>
                        <p className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">{card.value}</p>
                      </div>
                      <span className="h-10 w-10 rounded-2xl" style={{ backgroundColor: `${card.accent}22` }} />
                    </div>
                  </div>
                ))}
              </motion.div>
            </AnimatePresence>
          </header>

          <section className="grid min-h-0 gap-6 xl:grid-cols-[1.35fr_0.65fr]">

            {/* Table records */}
            <div className="min-h-0 min-w-0 overflow-hidden rounded-4xl border border-white/80 bg-white/72 p-5 shadow-[0_30px_90px_rgba(26,79,138,0.10)] backdrop-blur-2xl lg:p-6">
              {/* ── top bar ── */}
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h3 className="font-display text-2xl font-semibold text-slate-950">Table records</h3>
                  <p className="mt-1 text-sm text-slate-600">
                    {loading
                      ? "Loading live records from Postgres..."
                      : `Showing ${filteredRows.length} of ${snapshot.total} records.`}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {/* search */}
                  <label className="flex items-center gap-3 rounded-full border border-white/75 bg-white px-4 py-2.5 shadow-sm">
                    <svg className="h-3.5 w-3.5 shrink-0 text-slate-400" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="6.5" cy="6.5" r="4.5"/><path d="m10.5 10.5 3 3" strokeLinecap="round"/></svg>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search all columns…"
                      className="w-44 bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-400"
                    />
                    {search && (
                      <button type="button" onClick={() => setSearch("")} className="text-slate-400 hover:text-slate-600">✕</button>
                    )}
                  </label>
                  {/* filter toggle */}
                  <button
                    type="button"
                    onClick={() => setFilterOpen((o) => !o)}
                    className={`flex items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-semibold shadow-sm transition ${
                      filterOpen || filters.length > 0
                        ? "border-[#1A4F8A]/30 bg-[#1A4F8A]/8 text-[#1A4F8A]"
                        : "border-white/75 bg-white text-slate-600 hover:border-slate-200"
                    }`}
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M1 3h14M3.5 8h9M6 13h4" strokeLinecap="round"/></svg>
                    Filters
                    {filters.length > 0 && (
                      <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[#1A4F8A] text-[10px] font-bold text-white">
                        {filters.length}
                      </span>
                    )}
                  </button>
                </div>
              </div>

              {/* ── filter builder panel ── */}
              <AnimatePresence initial={false}>
                {filterOpen && (
                  <motion.div
                    key="filter-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto", transition: { duration: 0.24, ease: EASE_OUT } }}
                    exit={{ opacity: 0, height: 0, transition: { duration: 0.16 } }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4 rounded-3xl border border-[#1A4F8A]/12 bg-[#1A4F8A]/4 p-4">
                      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.24em] text-[#1A4F8A]">Add filter rule</p>
                      <div className="flex flex-wrap gap-2">
                        {/* column */}
                        <select
                          value={draftCol}
                          onChange={(e) => setDraftCol(e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10 cursor-pointer"
                        >
                          <option value="">Select column…</option>
                          {visibleColumns.map((col) => (
                            <option key={col.column} value={col.column}>{formatLabel(col.column)}</option>
                          ))}
                        </select>
                        {/* operator */}
                        <select
                          value={draftOp}
                          onChange={(e) => setDraftOp(e.target.value)}
                          className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10 cursor-pointer"
                        >
                          {OPERATORS.map((op) => (
                            <option key={op.value} value={op.value}>{op.label}</option>
                          ))}
                        </select>
                        {/* value input (hidden for is_empty / is_not_empty) */}
                        {!["is_empty", "is_not_empty"].includes(draftOp) && (
                          <input
                            value={draftVal}
                            onChange={(e) => setDraftVal(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && addFilter()}
                            placeholder="Value…"
                            className="rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 outline-none focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10 w-36"
                          />
                        )}
                        <button
                          type="button"
                          onClick={addFilter}
                          disabled={!draftCol}
                          className="rounded-2xl bg-[#1A4F8A] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#173f6b] disabled:opacity-40"
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* ── active filter chips ── */}
              <AnimatePresence>
                {filters.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.18 }}
                    className="mt-3 flex flex-wrap items-center gap-2"
                  >
                    {filters.map((f) => (
                      <span
                        key={f.id}
                        className="flex items-center gap-1.5 rounded-full border border-[#1A4F8A]/20 bg-[#1A4F8A]/8 px-3 py-1 text-xs font-medium text-[#1A4F8A]"
                      >
                        <span className="font-semibold">{formatLabel(f.column)}</span>
                        <span className="opacity-70">{OPERATOR_LABEL[f.operator]}</span>
                        {f.value && <span className="font-semibold">"{f.value}"</span>}
                        <button
                          type="button"
                          onClick={() => removeFilter(f.id)}
                          className="ml-0.5 rounded-full text-[#1A4F8A]/60 hover:text-[#1A4F8A] transition"
                        >
                          ✕
                        </button>
                      </span>
                    ))}
                    <button
                      type="button"
                      onClick={() => setFilters([])}
                      className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
                    >
                      Clear all
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    transition={{ duration: 0.2 }}
                    className="mt-4 rounded-3xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700"
                  >
                    {error}
                  </motion.div>
                )}
              </AnimatePresence>

              <AnimatePresence>
                {notice && (
                  <div className="pointer-events-none fixed right-4 top-4 z-50 flex justify-end">
                    <motion.div
                      initial={{ opacity: 0, y: -10, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -10, scale: 0.98 }}
                      transition={{ duration: 0.16 }}
                      className="rounded-2xl border border-emerald-200 bg-emerald-50/95 px-4 py-3 text-sm font-medium text-emerald-800 shadow-lg shadow-emerald-900/10 backdrop-blur"
                    >
                      {notice}
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>

              <div className="mt-5 overflow-hidden rounded-[28px] border border-white/75 bg-white/80 shadow-inner">
                <div className="max-h-[calc(100vh-22rem)] w-full max-w-full overflow-auto">
                  <table className="w-max min-w-full border-separate border-spacing-0 text-left text-sm">
                    <thead className="sticky top-0 z-10 bg-[#FFF9F0]/95 backdrop-blur">
                      <tr>
                        <th className="w-14 min-w-0 border-b border-slate-200 px-3 py-4 text-[11px] uppercase tracking-[0.28em] text-slate-500">#</th>
                        {tableColumns.map((col) => (
                          <th key={col.column} className="min-w-40 border-b border-slate-200 px-4 py-4 text-[11px] uppercase tracking-[0.28em] text-slate-500">
                            <div className="flex items-center gap-2">
                              <span>{formatLabel(col.column)}</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500">
                                {formatTypeLabel(col.type)}
                              </span>
                            </div>
                          </th>
                        ))}
                        <th className="min-w-36 border-b border-slate-200 px-4 py-4 text-[11px] uppercase tracking-[0.28em] text-slate-500">Actions</th>
                      </tr>
                    </thead>
                    <AnimatePresence mode="wait">
                      <motion.tbody
                        key={activeTableName}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1, transition: { duration: 0.22, staggerChildren: 0.03 } }}
                        exit={{ opacity: 0, transition: { duration: 0.14 } }}
                      >
                        {filteredRows.length === 0 && !loading ? (
                          <tr>
                            <td colSpan={tableColumns.length + 2} className="px-4 py-12 text-center text-sm text-slate-500">
                              No records found for this table.
                            </td>
                          </tr>
                        ) : null}

                        {filteredRows.map((row, index) => {
                          const pk = snapshot.primaryKey ?? activeTable?.primary_key[0] ?? null;
                          const rowId = pk ? String(row[pk]) : String(index);
                          return (
                            <motion.tr
                              key={rowId}
                              initial={{ opacity: 0, y: 6 }}
                              animate={{ opacity: 1, y: 0, transition: { delay: Math.min(index, 12) * 0.025, duration: 0.2 } }}
                              className="group border-b border-slate-100 transition hover:bg-[#FFF9F0]"
                            >
                              <td className="w-14 min-w-0 border-b border-slate-100 px-3 py-4 text-center align-top text-xs text-slate-400">
                                {index + 1}
                              </td>
                              {tableColumns.map((col) => {
                                const fkLabel = fkLabelMap[col.column]?.[String(row[col.column] ?? "")];
                                const cellValue = col.column === "available_staff_count"
                                  ? employeeCountMap[String(row.location_id ?? "")] ?? 0
                                  : row[col.column];
                                const pkVal = pk ? row[pk] : null;
                                const rowId = pkVal !== null && pkVal !== undefined ? String(pkVal) : String(index);
                                const isPerm = activeTableName === "role_master" && col.column === "permissions";
                                const isExpanded = expandedPerms.has(rowId);
                                return (
                                  <td key={col.column} className="min-w-40 max-w-[20rem] border-b border-slate-100 px-4 py-4 align-top text-slate-700">
                                    {isPerm ? (
                                      <button
                                        type="button"
                                        onClick={() => setExpandedPerms((prev) => {
                                          const next = new Set(prev);
                                          if (isExpanded) next.delete(rowId); else next.add(rowId);
                                          return next;
                                        })}
                                        className="w-full cursor-pointer text-left font-mono text-xs leading-5 text-slate-600 hover:text-[#1A4F8A]"
                                      >
                                        {isExpanded
                                          ? String(cellValue)
                                          : String(cellValue).length > 60
                                            ? String(cellValue).slice(0, 60) + "…"
                                            : String(cellValue)}
                                      </button>
                                    ) : (
                                      <div className="wrap-break-word">{fkLabel ?? formatCellValue(col, cellValue)}</div>
                                    )}
                                  </td>
                                );
                              })}
                              <td className="min-w-36 border-b border-slate-100 px-4 py-4 align-top">
                                <div className="flex gap-2">
                                  <button
                                    type="button"
                                    onClick={() => openEdit(row)}
                                    className="rounded-full border border-[#1A4F8A]/20 bg-white px-3 py-2 text-xs font-semibold text-[#1A4F8A] transition hover:border-[#1A4F8A]/35 hover:bg-[#1A4F8A]/6"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const id = pk ? row[pk] : null;
                                      if (id !== null && id !== undefined) setDeletePrompt(String(id));
                                    }}
                                    className="rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-100"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </td>
                            </motion.tr>
                          );
                        })}
                      </motion.tbody>
                    </AnimatePresence>
                  </table>
                </div>
              </div>
            </div>

            {/* Right sidebar */}
            <AnimatePresence mode="wait">
              <motion.aside
                key={activeTableName + "-aside"}
                variants={TABLE_SWITCH}
                initial="initial"
                animate="animate"
                exit="exit"
                className="space-y-6"
              >
                <div className="rounded-4xl border border-white/80 bg-white/72 p-5 shadow-[0_30px_90px_rgba(26,79,138,0.10)] backdrop-blur-2xl lg:p-6">
                  <h3 className="font-display text-2xl font-semibold text-slate-950">Schema map</h3>
                  <p className="mt-1 text-sm text-slate-600">Outgoing and incoming relationships for the active table.</p>

                  <div className="mt-4 space-y-3">
                    <div className="rounded-[26px] border border-[#1A4F8A]/12 bg-[#1A4F8A]/5 p-4">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-[#1A4F8A]">Outgoing</p>
                      <div className="mt-3 space-y-2">
                        {outgoingRelations.length === 0 ? (
                          <p className="text-sm text-slate-500">No outbound foreign keys.</p>
                        ) : (
                          outgoingRelations.map((rel) => (
                            <div key={`${rel.column}-${rel.references_table}`} className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
                              <p className="text-sm font-medium text-slate-900">{formatLabel(rel.column)}</p>
                              <p className="text-xs text-slate-500">{rel.references_table}.{rel.references_column}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-[26px] border border-[#2A7D5F]/12 bg-[#2A7D5F]/5 p-4">
                      <p className="text-[11px] uppercase tracking-[0.28em] text-[#2A7D5F]">Incoming</p>
                      <div className="mt-3 space-y-2">
                        {incomingRelations.length === 0 ? (
                          <p className="text-sm text-slate-500">No inbound foreign keys.</p>
                        ) : (
                          incomingRelations.map((rel) => (
                            <div key={`${rel.table_name}-${rel.column}`} className="rounded-2xl bg-white/85 px-4 py-3 shadow-sm">
                              <p className="text-sm font-medium text-slate-900">{formatLabel(rel.table_name)}</p>
                              <p className="text-xs text-slate-500">{formatLabel(rel.column)} → {rel.references_column}</p>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-4xl border border-white/80 bg-white/72 p-5 shadow-[0_30px_90px_rgba(26,79,138,0.10)] backdrop-blur-2xl lg:p-6">
                  <h3 className="font-display text-2xl font-semibold text-slate-950">Fields</h3>
                  <p className="mt-1 text-sm text-slate-600">System-generated columns stay out of the editable form, while the rest are reflected here.</p>
                  <div className="mt-4 space-y-3">
                    {visibleColumns.map((col) => (
                      <div key={col.column} className="rounded-3xl border border-white/80 bg-white/85 p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-medium text-slate-950">{formatLabel(col.column)}</p>
                            <p className="text-xs text-slate-500">{formatTypeLabel(col.type)}</p>
                          </div>
                          <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] ${col.nullable ? "bg-[#2A7D5F]/10 text-[#2A7D5F]" : "bg-[#FF6600]/10 text-[#FF6600]"}`}>
                            {col.nullable ? "Optional" : "Required"}
                          </span>
                        </div>
                        <p className="mt-2 text-xs text-slate-500">
                          {col.default ? `Default: ${col.default}` : "No default value."}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </motion.aside>
            </AnimatePresence>
          </section>
        </main>
      </div>

      {/* ── Create / Edit Modal ────────────────────────────────────────────── */}
      <AnimatePresence>
        {formOpen && activeTable && (
          <motion.div
            key="form-overlay"
            variants={MODAL_OVERLAY}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 py-6 backdrop-blur-sm"
          >
            <motion.div
              variants={MODAL_CARD}
              initial="initial"
              animate="animate"
              exit="exit"
              className={`flex max-h-[92vh] w-full flex-col overflow-hidden rounded-[36px] border border-white/80 bg-[#fffdf8]/96 shadow-[0_40px_120px_rgba(26,79,138,0.22)] ${activeTableName === "role_master" ? "max-w-6xl" : "max-w-5xl"}`}
            >
              <div className="flex shrink-0 items-start justify-between gap-6 border-b border-slate-200 px-6 py-5">
                <div>
                  <p className="text-xs uppercase tracking-[0.32em] text-[#1A4F8A]">
                    {mode === "create" ? "Create record" : "Edit record"}
                  </p>
                  <h3 className="font-display mt-2 text-3xl font-semibold text-slate-950">
                    {formatLabel(activeTable.table_name)}
                  </h3>
                  <p className="mt-2 text-sm text-slate-600">
                    {activeTableName === "role_master"
                      ? "Configure ERP access by selecting permissions through controls. The system will generate the JSON internally."
                      : `${activeTable.columns.length} columns, ${activeTable.foreign_keys.length} relationships, primary key ${snapshot.primaryKey ?? activeTable.primary_key[0] ?? "n/a"}.`}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
                >
                  Close
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
                {activeTableName === "role_master" ? (
                  <div className="flex flex-col gap-5 lg:flex-row">
                    {/* ── Left: Role Details ──────────────────────────────── */}
                    <div className="w-full shrink-0 space-y-4 lg:w-[320px]">
                      <div className="space-y-4 rounded-3xl border border-white/80 bg-white/85 p-5 shadow-sm">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#1A4F8A]">Role Details</p>

                        {mode === "edit" && currentRowId && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-sm font-semibold text-slate-900">Role ID</span>
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">AUTO</span>
                            </div>
                            <input value={currentRowId} readOnly className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 outline-none" />
                            <p className="text-xs text-slate-500">Primary key. Not editable.</p>
                          </div>
                        )}

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">Role Name</span>
                            <span className="rounded-full bg-[#FF6600]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#FF6600]">REQUIRED</span>
                          </div>
                          <input
                            type="text"
                            value={String(formState.role_name ?? "")}
                            onChange={(e) => updateForm("role_name", e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10"
                            placeholder="e.g. Store Manager"
                          />
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">Role Code</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">SYSTEM</span>
                          </div>
                          <input
                            type="text"
                            value={String(formState.role_code ?? "")}
                            readOnly
                            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500 outline-none"
                          />
                          <p className="text-xs text-slate-500">Generated from role name, or from selected template.</p>
                        </div>

                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-sm font-semibold text-slate-900">Status</span>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">SELECT</span>
                          </div>
                          <select
                            value={String(formState.status ?? "active")}
                            onChange={(e) => updateForm("status", e.target.value)}
                            className={selectClass}
                          >
                            <option value="active">ACTIVE</option>
                            <option value="inactive">INACTIVE</option>
                          </select>
                        </div>

                        <div className="rounded-2xl border-l-4 border-[#FFD700] bg-[#2A7D5F]/10 px-4 py-3 text-sm font-medium leading-relaxed text-[#1b5140]">
                          Permissions are selected on the right. The JSONB value is generated by the system and saved silently.
                        </div>
                      </div>

                      <div className="space-y-2 rounded-3xl border border-white/80 bg-white/85 p-5 shadow-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-semibold text-slate-900">Generated Permissions JSON</span>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">READ ONLY</span>
                        </div>
                        <textarea
                          readOnly
                          value={stringifyPermissionMatrix(permissionDraft)}
                          rows={10}
                          className="w-full resize-none rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 font-mono text-xs leading-5 text-slate-600 outline-none"
                        />
                        <p className="text-xs text-slate-500">Admin audit view. Not directly editable.</p>
                      </div>
                    </div>

                    {/* ── Right: Permission Builder ────────────────────────── */}
                    <div className="min-w-0 flex-1 rounded-3xl border border-white/80 bg-white/85 p-5 shadow-sm">
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.26em] text-[#1A4F8A]">Permission Builder</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
                            <button
                              type="button"
                              onClick={() => setPermissionMode("custom")}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${permissionMode === "custom" ? "bg-[#1A4F8A] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                              Custom
                            </button>
                            <button
                              type="button"
                              onClick={() => setPermissionMode("template")}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${permissionMode === "template" ? "bg-[#1A4F8A] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                              Template
                            </button>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              const next = createEmptyPermissionMatrix();
                              for (const module of PERMISSION_MODULES) {
                                for (const submodule of module.submodules) {
                                  next[module.name][submodule]["View"] = true;
                                }
                              }
                              setPermissionDraft(next);
                            }}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-[#1A4F8A] transition hover:bg-slate-50"
                          >
                            View Only
                          </button>
                          <button
                            type="button"
                            onClick={() => setPermissionDraft(createEmptyPermissionMatrix())}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 transition hover:bg-slate-50"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {permissionMode === "template" ? (
                        <div className="flex items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50 py-16 text-sm text-slate-500">
                          Role templates coming soon — use Custom mode to build permissions manually.
                        </div>
                      ) : (
                          <div className="overflow-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
                            <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                              High-power actions are grade-gated. Use designation grade plus any override_grade_code before allowing Delete, Approve, Export, Run Payroll, or Correct Attendance.
                            </div>
                          {PERMISSION_MODULES.map((module) => (
                            <div key={module.name} className="border-b border-slate-100 last:border-b-0">
                              <div className="grid grid-cols-[160px_repeat(8,minmax(0,1fr))] gap-2 border-b border-slate-100 bg-[#1A4F8A]/6 px-4 py-2.5">
                                <div className="text-sm font-bold text-[#1A4F8A]">{module.name}</div>
                                {PERMISSION_ACTIONS.map((action) => (
                                  <div key={action} className={`text-center text-[10px] font-bold uppercase tracking-[0.16em] ${isHighPowerAction(action) ? "text-[#FF6600]" : "text-slate-500"}`}>
                                    {action}
                                  </div>
                                ))}
                              </div>
                              {module.submodules.map((submodule) => (
                                <div key={submodule} className="grid grid-cols-[160px_repeat(8,minmax(0,1fr))] gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0 transition hover:bg-slate-50/50">
                                  <div className="text-sm font-medium text-slate-800">{submodule}</div>
                                  {PERMISSION_ACTIONS.map((action) => {
                                    const checked = Boolean(permissionDraft[module.name]?.[submodule]?.[action]);
                                    const isDelete = action === "Delete";
                                    return (
                                      <label key={action} className="flex items-center justify-center" title={`${action} — ${submodule}`}>
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={(e) => {
                                            const next = structuredClone(permissionDraft);
                                            next[module.name][submodule][action] = e.target.checked;
                                            setPermissionDraft(next);
                                          }}
                                          className={`h-4.5 w-4.5 cursor-pointer rounded border-slate-300 transition focus:ring-2 ${isDelete ? "accent-[#FF6600] focus:ring-[#FF6600]/20" : "accent-[#2A7D5F] focus:ring-[#2A7D5F]/20"}`}
                                        />
                                      </label>
                                    );
                                  })}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                <motion.div
                  className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
                  variants={FIELD_STAGGER_PARENT}
                  initial="initial"
                  animate="animate"
                >
                  {formColumns.map((column) => {
                    const kind      = getFieldKind(column);
                    const isDepartmentShortCode = activeTable.table_name === "department_master" && column.column === "department_short_code";
                    const isParentEntityRole = activeTable.table_name === "parent_entity" && column.column === "entity_role";
                    const isEmployeeAddressTable = activeTable.table_name === "employee_address";
                    const isPermanentAddressField = isEmployeeAddressTable && column.column.startsWith("permanent_");
                    const sameAddressEnabled = isEmployeeAddressTable && Boolean(formState.same_address);
                    const isRolePermissionsField = activeTable.table_name === "role_master" && column.column === "permissions";
                    const readOnly  = isLockedGeneratedField(activeTable.table_name, column.column) || (mode === "create" && Boolean(column.default?.includes("nextval(")));
                    const value     = formState[column.column] ?? "";
                    const inputValue = inputValueForField(column, value);

                    const fkOpts       = fkOptions[column.column];
                    const isFkColumn   = activeTable.foreign_keys.some((fk) => fk.column === column.column);
                    const hasFkOptions = Array.isArray(fkOpts) && fkOpts.length > 0;
                    const addressGeoInfo = getAddressGeoInfo(column.column);
                    const isGeoField = ["country", "country_code", "state", "state_code", "city"].includes(column.column) || Boolean(addressGeoInfo);
                    const isEmployeeLocationField = activeTable.table_name === "employee_master" && column.column === "location_id";
                    const hasParentEntity = String(formState.parent_entity_id ?? "").trim() !== "";

                    let geoOpts: FkOption[] | null = null;
                    if (!hasFkOptions && kind === "text") {
                      if ((column.column === "country" || column.column === "present_country" || column.column === "permanent_country") && geoCountries.length > 0)
                        geoOpts = geoCountries.map((c) => ({ value: c.name, label: c.name }));
                      else if (column.column === "country_code" && geoCountries.length > 0)
                        geoOpts = geoCountries.map((c) => ({ value: c.iso2, label: `${c.iso2} — ${c.name}` }));
                      else if ((column.column === "state" || column.column === "present_state" || column.column === "permanent_state") && geoStates.length > 0)
                        geoOpts = geoStates.map((s) => ({ value: s.name, label: s.name }));
                      else if (column.column === "state_code" && geoStates.length > 0)
                        geoOpts = geoStates.map((s) => ({ value: s.iso2, label: `${s.iso2} — ${s.name}` }));
                      else if (column.column === "city")
                        geoOpts = geoCities.map((city) => ({ value: city.name, label: city.name }));
                      else if (addressGeoInfo?.kind === "city") {
                        const scopedCities = addressGeoInfo.prefix === "present" ? presentGeoCities : permanentGeoCities;
                        geoOpts = scopedCities.map((city) => ({ value: city.name, label: city.name }));
                      }
                    }
                    const hasGeoOptions = Array.isArray(geoOpts) && geoOpts.length > 0;
                    const useGeoSelect = isGeoField || hasGeoOptions;
                    const geoSelectOptions = geoOpts ?? [];
                    const geoStateCodeForField = addressGeoInfo?.prefix === "present"
                      ? presentStateCode
                      : addressGeoInfo?.prefix === "permanent"
                        ? permanentStateCode
                        : selectedStateCode;
                    const geoCountryForField = addressGeoInfo ? String(formState[`${addressGeoInfo.prefix}_country`] ?? "").trim() : "";
                    const isCityField = column.column === "city" || addressGeoInfo?.kind === "city";
                    const isLockedBySameAddress = sameAddressEnabled && isPermanentAddressField;
                    const needsCountryForAddressField = addressGeoInfo != null && addressGeoInfo.kind !== "country" && !geoCountryForField;
                    const needsStateForCity = isCityField && !geoStateCodeForField;
                    const geoPlaceholder = addressGeoInfo
                      ? (addressGeoInfo.kind === "city"
                          ? (!geoCountryForField ? "Select a country first" : !geoStateCodeForField ? "Select a state first" : "— Select —")
                          : addressGeoInfo.kind === "state" && !geoCountryForField
                            ? "Select a country first"
                            : "— Select —")
                      : (column.column === "city" && !selectedStateCode ? "Select a state first" : "— Select —");

                    const staticOpts   = STATIC_ENUM_OPTIONS[column.column];
                    const hasStaticOpts = !isFkColumn && !useGeoSelect && Array.isArray(staticOpts) && staticOpts.length > 0 && kind === "text";

                    return (
                      <motion.label
                        key={column.column}
                        variants={FIELD_ITEM}
                        className="flex flex-col gap-2 rounded-3xl border border-white/80 bg-white/85 p-4 shadow-sm"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-sm font-semibold text-slate-900">
                            {isParentEntityRole ? "Business relationship role" : formatLabel(column.column)}
                          </span>
                          <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                            {hasFkOptions ? "relation" : hasGeoOptions ? "geo" : hasStaticOpts ? "select" : kind}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500">{formatTypeLabel(column.type)}</p>

                        {kind === "checkbox" ? (
                          <div className="flex gap-2 rounded-2xl border border-slate-200 bg-slate-50 p-1.5">
                            <button
                              type="button"
                              disabled={readOnly || isLockedBySameAddress}
                              onClick={() => updateForm(column.column, true)}
                              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${Boolean(inputValue) ? "bg-[#2A7D5F] text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                              Yes
                            </button>
                            <button
                              type="button"
                              disabled={readOnly || isLockedBySameAddress}
                              onClick={() => updateForm(column.column, false)}
                              className={`flex-1 rounded-xl py-2 text-sm font-semibold transition ${!Boolean(inputValue) ? "bg-rose-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                            >
                              No
                            </button>
                          </div>
                        ) : isRolePermissionsField ? (
                          <div className="space-y-4 rounded-3xl border border-slate-200 bg-slate-50/80 p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-900">Permission Builder</p>
                                <p className="text-xs text-slate-500">Structured module and workflow toggles save into the JSONB permissions column internally.</p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = createEmptyPermissionMatrix();
                                    for (const module of PERMISSION_MODULES) {
                                      for (const submodule of module.submodules) {
                                        next[module.name][submodule].View = true;
                                      }
                                    }
                                    setPermissionDraft(next);
                                  }}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  View Only
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPermissionDraft(createEmptyPermissionMatrix())}
                                  className="rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  Clear
                                </button>
                              </div>
                            </div>

                            <div className="overflow-hidden rounded-3xl border border-white/80 bg-white shadow-sm">
                              <div className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-amber-800">
                                High-power actions are grade-gated. Use designation grade plus any override_grade_code before allowing Delete, Approve, Export, Run Payroll, or Correct Attendance.
                              </div>
                              <div className="grid grid-cols-[210px_repeat(8,minmax(0,1fr))] gap-2 border-b border-slate-200 bg-[#1A4F8A]/6 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                                <div>Module / Sub-module</div>
                                {PERMISSION_ACTIONS.map((action) => (
                                  <div key={action} className={`text-center ${isHighPowerAction(action) ? "text-[#FF6600]" : ""}`}>
                                    {action}
                                  </div>
                                ))}
                              </div>

                              <div className="space-y-2 p-3">
                                {PERMISSION_MODULES.map((module) => (
                                  <div key={module.name} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                                    <div className="grid grid-cols-[210px_repeat(8,minmax(0,1fr))] gap-2 border-b border-slate-200 bg-[#1A4F8A]/8 px-4 py-3">
                                      <div className="text-sm font-semibold text-[#1A4F8A]">{module.name}</div>
                                      <div className="col-span-8 text-xs text-slate-500">Select module permissions below</div>
                                    </div>

                                    {module.submodules.map((submodule) => (
                                      <div key={submodule} className="grid grid-cols-[210px_repeat(8,minmax(0,1fr))] gap-2 border-b border-slate-100 px-4 py-3 last:border-b-0">
                                        <div className="text-sm font-medium text-slate-900">{submodule}</div>
                                        {PERMISSION_ACTIONS.map((action) => {
                                          const checked = Boolean(permissionDraft[module.name]?.[submodule]?.[action]);
                                          return (
                                            <label key={action} className="flex items-center justify-center">
                                              <input
                                                type="checkbox"
                                                checked={checked}
                                                onChange={(event) => {
                                                  const next = structuredClone(permissionDraft);
                                                  next[module.name][submodule][action] = event.target.checked;
                                                  setPermissionDraft(next);
                                                }}
                                                className="h-4 w-4 rounded border-slate-300 text-[#2A7D5F] focus:ring-[#2A7D5F]"
                                              />
                                            </label>
                                          );
                                        })}
                                      </div>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            </div>

                            <pre className="max-h-56 overflow-auto rounded-2xl border border-slate-200 bg-slate-950 px-4 py-3 text-xs leading-5 text-slate-100">
                              {stringifyPermissionMatrix(permissionDraft)}
                            </pre>
                          </div>
                        ) : kind === "json" ? (
                          <textarea
                            rows={5}
                            value={String(inputValue)}
                            readOnly={readOnly || isLockedBySameAddress}
                            onChange={(e) => updateForm(column.column, e.target.value)}
                            className="min-h-32 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10"
                            placeholder={column.default ? `Default: ${column.default}` : "{}"}
                          />
                        ) : isFkColumn && activeTableName === "holiday_calendar" && column.column === "location_id" ? (
                          <div ref={locationDropdownRef} className="relative flex flex-col gap-1.5">
                            <button
                              type="button"
                              onClick={() => setLocationDropdownOpen(!locationDropdownOpen)}
                              className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700 transition hover:border-slate-300"
                            >
                              <span>
                                {String(inputValue) ? `${String(inputValue).split(",").filter(Boolean).length} location(s) selected` : "— Select locations —"}
                              </span>
                              <svg className={`h-4 w-4 text-slate-400 transition ${locationDropdownOpen ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                              </svg>
                            </button>
                            {locationDropdownOpen && (
                              <div className="absolute left-0 right-0 top-full z-50 mt-1 flex flex-col gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                                <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">
                                  <input
                                    type="checkbox"
                                    checked={hasFkOptions && String(inputValue).split(",").filter(Boolean).length === fkOpts.length}
                                    onChange={() => {
                                      if (String(inputValue).split(",").filter(Boolean).length === fkOpts.length) {
                                        updateForm(column.column, "");
                                      } else {
                                        updateForm(column.column, fkOpts.map((o) => o.value).join(","));
                                      }
                                    }}
                                    className="h-4 w-4 rounded border-slate-300 text-[#1A4F8A] focus:ring-[#1A4F8A]"
                                  />
                                  Select All
                                </label>
                                <div className="max-h-36 overflow-auto border-t border-slate-100 pt-1">
                                  {fkOpts?.length ? fkOpts.map((opt) => {
                                    const selected = String(inputValue).split(",").includes(opt.value);
                                    return (
                                      <label key={opt.value} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm text-slate-700 transition hover:bg-slate-50">
                                        <input
                                          type="checkbox"
                                          checked={selected}
                                          onChange={() => {
                                            const current = String(inputValue).split(",").filter(Boolean);
                                            const next = selected
                                              ? current.filter((v) => v !== opt.value)
                                              : [...current, opt.value];
                                            updateForm(column.column, next.join(","));
                                          }}
                                          className="h-4 w-4 rounded border-slate-300 text-[#1A4F8A] focus:ring-[#1A4F8A]"
                                        />
                                        {opt.label}
                                      </label>
                                    );
                                  }) : <p className="px-2 py-3 text-center text-xs text-slate-400">No eligible options</p>}
                                </div>
                              </div>
                            )}
                          </div>
                        ) : isFkColumn ? (
                          <select
                            value={String(inputValue)}
                            disabled={readOnly || isLockedBySameAddress || (isEmployeeLocationField && !hasParentEntity)}
                            onChange={(e) => updateForm(column.column, e.target.value)}
                            className={selectClass}
                          >
                            <option value="">
                              {isEmployeeLocationField && !hasParentEntity
                                ? "Select parent entity first"
                                : hasFkOptions
                                  ? "— Select —"
                                  : "No eligible options"}
                            </option>
                            {fkOpts?.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                          ) : useGeoSelect ? (
                          <select value={String(inputValue)} disabled={readOnly || isLockedBySameAddress || needsCountryForAddressField || needsStateForCity} onChange={(e) => updateForm(column.column, e.target.value)} className={selectClass}>
                            <option value="">{geoPlaceholder}</option>
                              {geoSelectOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        ) : hasStaticOpts ? (
                          <select value={String(inputValue)} disabled={readOnly || isLockedBySameAddress} onChange={(e) => updateForm(column.column, e.target.value)} className={selectClass}>
                            <option value="">— Select —</option>
                            {staticOpts.map((opt) => <option key={opt} value={opt}>{formatLabel(opt)}</option>)}
                          </select>
                        ) : (
                          <input
                            type={kind === "datetime" ? "datetime-local" : kind === "date" ? "date" : kind === "time" ? "time" : kind === "number" ? "number" : "text"}
                            value={String(inputValue)}
                            readOnly={readOnly || isLockedBySameAddress}
                            onChange={(e) => {
                              const nextValue = isDepartmentShortCode ? normalizeDepartmentShortCode(e.target.value) : e.target.value;
                              updateForm(column.column, toInputValue(column, nextValue));
                            }}
                            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10"
                            placeholder={column.default ? `Default: ${column.default}` : undefined}
                            maxLength={isDepartmentShortCode ? 3 : undefined}
                            pattern={isDepartmentShortCode ? "[A-Z]{3}" : undefined}
                          />
                        )}

                        <p className="text-xs text-slate-500">
                          {column.nullable ? "Optional field." : "Required field."}
                          {isDepartmentShortCode ? " Enter exactly 3 uppercase letters." : ""}
                          {isLockedBySameAddress ? " Mirrors the present address while Same Address is enabled." : ""}
                          {readOnly ? " Auto-generated by the database." : ""}
                        </p>
                      </motion.label>
                    );
                  })}
                </motion.div>
                )}
              </div>

              <div className="flex shrink-0 items-center justify-end gap-3 border-t border-slate-200 bg-[#fffdf8]/96 px-6 py-5">
                <button
                  type="button"
                  onClick={closeForm}
                  className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => submitRecord().catch((e) => setError(e instanceof Error ? e.message : "Unable to save record"))}
                  disabled={submitting}
                  className="rounded-full bg-[#1A4F8A] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(26,79,138,0.25)] transition disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {submitting ? "Saving..." : mode === "create" ? "Create record" : "Save changes"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Delete Modal ───────────────────────────────────────────────────── */}
      <AnimatePresence>
        {deletePrompt && (
          <motion.div
            key="delete-overlay"
            variants={MODAL_OVERLAY}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/25 px-4 py-6 backdrop-blur-sm"
          >
            <motion.div
              variants={MODAL_CARD}
              initial="initial"
              animate="animate"
              exit="exit"
              className="w-full max-w-lg rounded-4xl border border-white/80 bg-white/95 p-6 shadow-[0_30px_90px_rgba(26,79,138,0.18)]"
            >
              <p className="text-xs uppercase tracking-[0.32em] text-[#FF6600]">Delete record</p>
              <h3 className="font-display mt-2 text-3xl font-semibold text-slate-950">Confirm removal</h3>
              <p className="mt-3 text-sm text-slate-600">
                This will permanently delete the selected record from {formatLabel(activeTableName)}.
              </p>
              <div className="mt-6 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setDeletePrompt(null)}
                  className="rounded-full border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => deleteRecord(deletePrompt)}
                  className="rounded-full bg-[#FF6600] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(255,102,0,0.25)]"
                >
                  Delete permanently
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
