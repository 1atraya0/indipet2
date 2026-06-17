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

type RosterEmployee = {
  employee_id: string;
  first_name: string;
  last_name: string;
  employee_code: string;
  location_id: string;
  preferred_weekly_off_day: string;
  designation_name?: string;
  role_name?: string;
};

type RosterPolicy = {
  policy_id: string;
  policy_code: string;
  policy_name: string;
  location_id: string;
  shift_category: string;
  shift_start_time: string;
  shift_end_time: string;
  sanctioned_strength: number;
  keyholder_required: boolean;
  max_leave_per_day: number;
  max_consecutive_days: number;
  weekly_off_pattern: string;
  weekly_off_day: number;
  critical_store_flag: boolean;
  roster_cycle: string;
  policy_status: string;
};

type RosterSlot = {
  slot_id: string;
  roster_id: string;
  employee_id: string;
  slot_type: string;
  slot_start: string;
  slot_end: string;
  slot_status: string;
  is_keyholder: boolean;
  preference_applied: boolean;
  preference_override: boolean;
};

type RosterHistoryEntry = {
  history_id: string;
  roster_id: string;
  location_id: string;
  roster_date: string;
  version: number;
  change_reason: string;
  created_at: string;
  action: string;
  changed_by: string;
};

type ShiftMeta = {
  label: string;
  code: string;
  time: string;
  className: string;
  policy: string;
};

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

const WEEKDAY_LABELS: Record<string, string> = {
  "1": "Monday", "2": "Tuesday", "3": "Wednesday", "4": "Thursday",
  "5": "Friday", "6": "Saturday", "7": "Sunday",
};

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
  shift_category: ["opening", "mid", "closing", "full_day"],
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
  verification_status: ["Pending", "Verified", "Rejected"],
  document_status: ["Active", "Expired", "Archived"],
  relationship: ["Spouse", "Parent", "Sibling", "Friend", "Other"],
  profile_status: ["Partial", "Complete"],
  preferred_weekly_off_day: ["1", "2", "3", "4", "5", "6", "7"],
  nationality: ["Indian", "American", "British", "Canadian", "Australian", "Singaporean", "UAE", "Other"],
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

  if (tableName === "roster" && (columnName === "available_staff_count" || columnName === "roster_code")) {
    return true;
  }

  if (tableName === "shift_policy_master" && (columnName === "total_shift_hours" || columnName === "net_work_hours")) {
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
    preferred_weekly_off_day: 130,
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

  const shiftPolicyPriority: Record<string, number> = {
    location_id: 5,
    policy_name: 10,
    policy_status: 20,
    shift_start_time: 30,
    shift_end_time: 40,
    break_duration_minutes: 50,
    total_shift_hours: 60,
    net_work_hours: 70,
    sanctioned_strength: 80,
    max_leave_per_day: 90,
    keyholder_required: 100,
    primary_keyholder_id: 110,
    backup_keyholder_id: 120,
    weekly_off_pattern: 130,
    weekly_off_day: 140,
    max_consecutive_days: 150,
  };

  const tableSpecificPriority: Record<string, Record<string, number>> = {
    parent_entity: parentEntityPriority,
    employee_address: employeeAddressPriority,
    employee_master: employeePriority,
    sub_location: subLocationPriority,
    shift_policy_master: shiftPolicyPriority,
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
  const [generateOpen, setGenerateOpen] = useState(false);
  const [genLocationId, setGenLocationId] = useState("");
  const [genShiftPolicyId, setGenShiftPolicyId] = useState("");
  const [genStartDate, setGenStartDate] = useState("");
  const [genEndDate, setGenEndDate] = useState("");
  const [genShiftPolicies, setGenShiftPolicies] = useState<Array<{ value: string; label: string; location_id: string; weekly_off_day: number; shift_category: string; shift_start_time: string; shift_end_time: string }>>([]);
  const [genLocations, setGenLocations] = useState<Record<string, string>>({});
  const [genSubmitting, setGenSubmitting] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importSubmitting, setImportSubmitting] = useState(false);
  const [importResult, setImportResult] = useState<{ total: number; created: number; skipped: number } | null>(null);
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

  // ─── roster planner state ─────────────────────────────────────────────────

  const [rosterLocationId, setRosterLocationId]         = useState("");
  const [rosterStartDate, setRosterStartDate]           = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  });
  const [rosterView, setRosterView]                     = useState<"planner" | "slots" | "history">("planner");
  const [rosterEmployees, setRosterEmployees]           = useState<RosterEmployee[]>([]);
  const [rosterPolicies, setRosterPolicies]             = useState<RosterPolicy[]>([]);
  const [rosterSlots, setRosterSlots]                   = useState<Record<string, string>>({});
  const [rosterSlotMeta, setRosterSlotMeta]             = useState<Record<string, RosterSlot>>({});
  const [rosterHistory, setRosterHistory]               = useState<RosterHistoryEntry[]>([]);
  const [rosterIdentity, setRosterIdentity]             = useState<Record<string, unknown> | null>(null);
  const [rosterCode, setRosterCode]                     = useState("");
  const [rosterStatus, setRosterStatus]                 = useState("draft");
  const [rosterVersion, setRosterVersion]               = useState(1);
  const [slotEditOpen, setSlotEditOpen]                 = useState(false);
  const [slotEditTarget, setSlotEditTarget]             = useState<{ employeeId: string; date: string } | null>(null);
  const [slotEditAssignment, setSlotEditAssignment]     = useState("O");
  const [slotEditReason, setSlotEditReason]             = useState("");
  const [genMode, setGenMode]                           = useState("balanced");
  const [rosterLocationNames, setRosterLocationNames]   = useState<Record<string, string>>({});
  const [rosterRefreshKey, setRosterRefreshKey]         = useState(0);

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
        setFormState((prev) => {
          if (activeTableName !== "shift_policy_master") {
            return {
              ...prev,
              effective_open_time: openTime ?? prev.effective_open_time,
              effective_close_time: closeTime ?? prev.effective_close_time,
            };
          }
          const category = String(prev.shift_category ?? "").trim();
          let startTime = openTime;
          let endTime = closeTime;
          if (category === "opening") {
            const [h, m] = openTime.split(":").map(Number);
            const total = h * 60 + m + 300;
            const nh = Math.floor(total / 60) % 24;
            endTime = `${String(nh).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
          } else if (category === "closing") {
            const [h, m] = closeTime.split(":").map(Number);
            const total = h * 60 + m - 300;
            const nh = ((total % 1440) + 1440) % 1440;
            startTime = `${String(Math.floor(nh / 60)).padStart(2, "0")}:${String(nh % 60).padStart(2, "0")}`;
          } else if (category === "mid") {
            const [oh, om] = openTime.split(":").map(Number);
            const [ch, cm] = closeTime.split(":").map(Number);
            const midStart = oh * 60 + om + 180;
            const midEnd = ch * 60 + cm - 180;
            if (midEnd > midStart) {
              startTime = `${String(Math.floor(midStart / 60)).padStart(2, "0")}:${String(midStart % 60).padStart(2, "0")}`;
              endTime = `${String(Math.floor(midEnd / 60)).padStart(2, "0")}:${String(midEnd % 60).padStart(2, "0")}`;
            }
          }
          return {
            ...prev,
            shift_start_time: startTime ?? prev.shift_start_time,
            shift_end_time: endTime ?? prev.shift_end_time,
          };
        });
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

  // Fetch shift policies + locations for roster generate modal
  useEffect(() => {
    if (!generateOpen) return;
    let cancelled = false;

    Promise.all([
      fetch("/api/table-data?table=shift_policy_master&limit=100").then((r) => r.json()),
      fetch("/api/table-data?table=sub_location&limit=100").then((r) => r.json()),
    ])
      .then(([shiftData, locData]) => {
        if (cancelled) return;
        setGenShiftPolicies(
          (shiftData.rows ?? []).map((r: Record<string, unknown>) => ({
            value: String(r.policy_id ?? ""),
            label: String(r.policy_code ?? r.policy_name ?? r.policy_id ?? ""),
            location_id: String(r.location_id ?? ""),
            weekly_off_day: Number(r.weekly_off_day ?? -1),
            shift_category: String(r.shift_category ?? ""),
            shift_start_time: String(r.shift_start_time ?? "").substring(0, 5),
            shift_end_time: String(r.shift_end_time ?? "").substring(0, 5),
          })),
        );
        const locLookup: Record<string, string> = {};
        for (const loc of locData.rows ?? []) {
          const name = String(loc.location_name ?? loc.location_code ?? loc.location_id ?? "");
          locLookup[String(loc.location_id ?? "")] = name;
        }
        setGenLocations(locLookup);
      })
      .catch(() => { if (!cancelled) { setGenShiftPolicies([]); setGenLocations({}); } });
    return () => { cancelled = true; };
  }, [generateOpen]);

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
              if (column === "reporting_manager_id") return "reporting_manager";
              return null;
            };

            const purposefulFks = fks.filter((fk) => purposeForColumn(fk.column) !== null);
            const genericFks = fks.filter((fk) => purposeForColumn(fk.column) === null);
            const purposeRows = new Map<string, Record<string, unknown>[]>();

            await Promise.all(
              [...new Set(purposefulFks.map((fk) => purposeForColumn(fk.column)!))].map(async (purpose) => {
                const params: Record<string, string | number | undefined> = { limit: 500, purpose };
                if (purpose === "reporting_manager") {
                  const locId = String(formState.location_id ?? "").trim();
                  if (locId) params.locationId = locId;
                }
                const res = await fetch(buildTableApiUrl("employee_master", params));
                if (!res.ok) return;
                const data = (await res.json()) as { rows: Record<string, unknown>[] };
                purposeRows.set(purpose, data.rows);
              }),
            );

            for (const fk of purposefulFks) {
              const purpose = purposeForColumn(fk.column)!;
              const rows = purposeRows.get(purpose) ?? [];
              results[fk.column] = rows.map((row) => ({
                value: String(row[fk.references_column] ?? ""),
                label: formatEmployeeLookupLabel(row),
              }));
            }

            if (genericFks.length > 0) {
              const res = await fetch(buildTableApiUrl("employee_master", { limit: 500 }));
              if (res.ok) {
                const data = (await res.json()) as { rows: Record<string, unknown>[] };
                for (const fk of genericFks) {
                  results[fk.column] = data.rows.map((row) => ({
                    value: String(row[fk.references_column] ?? ""),
                    label: formatEmployeeLookupLabel(row),
                  }));
                }
              }
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

  useEffect(() => {
    if (activeTableName !== "employee_master" || !formOpen) return;
    const deptId = String(formState.department_id ?? "").trim();
    if (!deptId) return;
    let cancelled = false;
    fetch(`/api/table-data?table=designation_master&limit=500&departmentId=${deptId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const refDef = tableLookup["designation_master"];
        setFkOptions((prev) => ({
          ...prev,
          designation_id: (data.rows ?? []).map((row: Record<string, unknown>) => ({
            value: String(row.designation_id ?? ""),
            label: getTableDisplayColumn(refDef, row),
          })),
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, formState.department_id]);

  useEffect(() => {
    if (activeTableName !== "employee_master" || !formOpen) return;
    const locId = String(formState.location_id ?? "").trim();
    if (!locId) return;
    let cancelled = false;
    fetch(`/api/table-data?table=shift_policy_master&limit=500&locationId=${locId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const rows = (data.rows ?? []) as Record<string, unknown>[];
        setFkOptions((prev) => ({
          ...prev,
          default_shift_id: rows.map((row: Record<string, unknown>) => ({
            value: String(row.policy_id ?? ""),
            label: String(row.policy_code ?? row.policy_name ?? row.policy_id ?? ""),
          })),
        }));
        if (mode !== "edit" || !currentRowId) return;
        const employeeId = String(currentRowId);
        fetch(`/api/table-data?table=employee_shift_preference&limit=10&employeeId=${employeeId}`)
          .then((r) => r.json())
          .then((prefData) => {
            if (cancelled) return;
            const prefs = (prefData.rows ?? []) as Record<string, unknown>[];
            const activePref = prefs.find((p) => String(p.is_active ?? "") !== "false") ?? prefs[0];
            if (!activePref) return;
            const prefType = String(activePref.preference_type ?? "").trim();
            const categoryMap: Record<string, string> = {
              morning: "opening",
              evening: "closing",
              night: "closing",
              flexible: "full_day",
            };
            const targetCategory = categoryMap[prefType];
            if (!targetCategory) return;
            const match = rows.find(
              (r) => String(r.shift_category ?? "").trim() === targetCategory,
            );
            if (!match) return;
            setFormState((prev) => ({
              ...prev,
              default_shift_id: String(match.policy_id ?? ""),
            }));
          })
          .catch(() => {});
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, formState.location_id, mode, currentRowId]);

  useEffect(() => {
    if (activeTableName !== "employee_master" || !formOpen) return;
    const locId = String(formState.location_id ?? "").trim();
    let cancelled = false;
    const params = new URLSearchParams({ table: "employee_master", purpose: "reporting_manager", limit: "500" });
    if (locId) params.set("locationId", locId);
    fetch(`/api/table-data?${params.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setFkOptions((prev) => ({
          ...prev,
          reporting_manager_id: (data.rows ?? []).map((row: Record<string, unknown>) => ({
            value: String(row.employee_id ?? ""),
            label: formatEmployeeLookupLabel(row),
          })),
        }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, formState.location_id]);

  useEffect(() => {
    if (activeTableName !== "employee_transfer_history" || !formOpen) return;
    const empId = String(formState.employee_id ?? "").trim();
    if (!empId) return;
    let cancelled = false;
    fetch(`/api/tables/employee_master/${empId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const locId = String(data.row?.location_id ?? "").trim();
        if (locId) {
          setFormState((prev) => ({ ...prev, from_location_id: locId }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, formState.employee_id]);

  useEffect(() => {
    if (activeTableName !== "employee_transfer_history" || !formOpen) return;
    const fromId = String(formState.from_location_id ?? "").trim();
    const toId = String(formState.to_location_id ?? "").trim();
    if (toId && toId === fromId) {
      setFormState((prev) => ({ ...prev, to_location_id: "" }));
    }
  }, [activeTableName, formOpen, formState.from_location_id]);

  useEffect(() => {
    if (activeTableName !== "employee_statutory" || !formOpen || mode !== "create") return;
    const empId = String(formState.employee_id ?? "").trim();
    if (!empId) return;
    let cancelled = false;
    fetch("/api/table-data?table=employee_address&limit=500")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const addr = (data.rows ?? []).find(
          (r: Record<string, unknown>) => String(r.employee_id ?? "") === empId,
        );
        const state = String(addr?.present_state ?? addr?.permanent_state ?? "").trim();
        if (state) {
          setFormState((prev) => ({ ...prev, professional_tax_state: state }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, mode, formState.employee_id]);

  useEffect(() => {
    if (activeTableName !== "employee_statutory" || !formOpen || mode !== "create") return;
    const empId = String(formState.employee_id ?? "").trim();
    if (!empId) return;
    let cancelled = false;
    fetch("/api/table-data?table=employee_finance&limit=500")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const fin = (data.rows ?? []).find(
          (r: Record<string, unknown>) => String(r.employee_id ?? "") === empId,
        );
        if (!fin) return;
        const updates: Record<string, string> = {};
        for (const col of ["pan_number", "uan_number", "pf_number", "esi_number"]) {
          const val = String(fin[col] ?? "").trim();
          if (val) updates[col] = val;
        }
        if (Object.keys(updates).length > 0) {
          setFormState((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, mode, formState.employee_id]);

  useEffect(() => {
    if (activeTableName !== "employee_finance" || !formOpen || mode !== "create") return;
    const empId = String(formState.employee_id ?? "").trim();
    if (!empId) return;
    let cancelled = false;
    fetch("/api/table-data?table=employee_statutory&limit=500")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const stat = (data.rows ?? []).find(
          (r: Record<string, unknown>) => String(r.employee_id ?? "") === empId,
        );
        if (!stat) return;
        const updates: Record<string, string> = {};
        for (const col of ["pan_number", "uan_number", "pf_number", "esi_number"]) {
          const val = String(stat[col] ?? "").trim();
          if (val) updates[col] = val;
        }
        if (Object.keys(updates).length > 0) {
          setFormState((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, mode, formState.employee_id]);

  // 9: Nominee auto-fill from emergency_contact (create mode)
  useEffect(() => {
    if (activeTableName !== "employee_statutory" || !formOpen || mode !== "create") return;
    const empId = String(formState.employee_id ?? "").trim();
    if (!empId) return;
    let cancelled = false;
    fetch(`/api/table-data?table=employee_emergency_contact&limit=500&employeeId=${empId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const primary = (data.rows ?? []).find(
          (r: Record<string, unknown>) => r.is_primary === true,
        ) ?? (data.rows ?? [])[0];
        if (!primary) return;
        const updates: Record<string, string> = {};
        const name = String(primary.contact_name ?? "").trim();
        if (name) updates.nominee_name = name;
        const rel = String(primary.relationship ?? "").trim();
        if (rel) updates.nominee_relation = rel;
        const phone = String(primary.phone ?? "").trim();
        if (phone) updates.nominee_phone = phone;
        if (Object.keys(updates).length > 0) {
          setFormState((prev) => ({ ...prev, ...updates }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, mode, formState.employee_id]);

  // 10: Scope transfer_history locations by employee's parent_entity_id
  useEffect(() => {
    if (activeTableName !== "employee_transfer_history" || !formOpen || mode !== "create") return;
    const empId = String(formState.employee_id ?? "").trim();
    if (!empId) return;
    let cancelled = false;
    fetch(`/api/tables/employee_master/${empId}`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const peId = String(data.row?.parent_entity_id ?? "").trim();
        if (!peId) return;
        return fetch(`/api/table-data?table=sub_location&limit=500&parentEntityId=${peId}`)
          .then((r) => r.json())
          .then((locData) => {
            if (cancelled) return;
            const refDef = tableLookup["sub_location"];
            const opts = (locData.rows ?? []).map((row: Record<string, unknown>) => ({
              value: String(row.location_id ?? ""),
              label: getTableDisplayColumn(refDef, row),
            }));
            setFkOptions((prev) => ({
              ...prev,
              from_location_id: opts,
              to_location_id: opts,
            }));
          });
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, mode, formState.employee_id]);

  // 11-13: Default today for date fields
  useEffect(() => {
    if (!formOpen || mode !== "create") return;
    const tables = ["employee_salary_history", "employee_bank_history", "employee_transfer_history"];
    if (!activeTableName || !tables.includes(activeTableName)) return;
    const today = new Date().toISOString().slice(0, 10);
    setFormState((prev) => {
      const updates: Record<string, string> = {};
      if ((activeTableName === "employee_salary_history" || activeTableName === "employee_bank_history") && !prev.effective_from) {
        updates.effective_from = today;
      }
      if (activeTableName === "employee_transfer_history" && !prev.transfer_date) {
        updates.transfer_date = today;
      }
      return Object.keys(updates).length > 0 ? { ...prev, ...updates } : prev;
    });
  }, [activeTableName, formOpen, mode]);

  // 14: Auto-increment capture_index for employee_face_captures
  useEffect(() => {
    if (activeTableName !== "employee_face_captures" || !formOpen || mode !== "create") return;
    const empId = String(formState.employee_id ?? "").trim();
    if (!empId) return;
    let cancelled = false;
    fetch("/api/table-data?table=employee_face_captures&limit=500")
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        const maxIndex = (data.rows ?? [])
          .filter((r: Record<string, unknown>) => String(r.employee_id ?? "") === empId)
          .reduce((max: number, r: Record<string, unknown>) => Math.max(max, Number(r.capture_index ?? 0)), 0);
        setFormState((prev) => ({ ...prev, capture_index: maxIndex + 1 }));
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, formOpen, mode, formState.employee_id]);

  // ─── roster planner data-fetching effects ──────────────────────────────────

  useEffect(() => {
    if (activeTableName !== "roster") return;
    let cancelled = false;
    Promise.all([
      fetch("/api/table-data?table=employee_master&limit=500").then((r) => r.json()),
      fetch("/api/table-data?table=shift_policy_master&limit=500").then((r) => r.json()),
      fetch("/api/table-data?table=sub_location&limit=500").then((r) => r.json()),
    ])
      .then(([empData, polData, locData]) => {
        if (cancelled) return;
        const employees = (empData.rows ?? []) as Record<string, unknown>[];
        const policies = (polData.rows ?? []) as Record<string, unknown>[];
        setRosterEmployees(
          employees.map((e) => ({
            employee_id: String(e.employee_id ?? ""),
            first_name: String(e.first_name ?? ""),
            last_name: String(e.last_name ?? ""),
            employee_code: String(e.employee_code ?? ""),
            location_id: String(e.location_id ?? ""),
            preferred_weekly_off_day: String(e.preferred_weekly_off_day ?? ""),
            designation_name: String(e.designation_name ?? ""),
            role_name: String(e.role_name ?? ""),
          })),
        );
        setRosterPolicies(
          policies.map((p) => ({
            policy_id: String(p.policy_id ?? ""),
            policy_code: String(p.policy_code ?? ""),
            policy_name: String(p.policy_name ?? ""),
            location_id: String(p.location_id ?? ""),
            shift_category: String(p.shift_category ?? "").trim(),
            shift_start_time: String(p.shift_start_time ?? "").substring(0, 5),
            shift_end_time: String(p.shift_end_time ?? "").substring(0, 5),
            sanctioned_strength: Number(p.sanctioned_strength ?? 0),
            keyholder_required: Boolean(p.keyholder_required),
            max_leave_per_day: Number(p.max_leave_per_day ?? 1),
            max_consecutive_days: Number(p.max_consecutive_days ?? 6),
            weekly_off_pattern: String(p.weekly_off_pattern ?? ""),
            weekly_off_day: Number(p.weekly_off_day ?? -1),
            critical_store_flag: Boolean(p.critical_store_flag),
            roster_cycle: String(p.roster_cycle ?? ""),
            policy_status: String(p.policy_status ?? ""),
          })),
        );
        const locLookup: Record<string, string> = {};
        for (const loc of locData.rows ?? []) {
          const r = loc as Record<string, unknown>;
          locLookup[String(r.location_id ?? "")] = String(r.location_name ?? r.location_code ?? r.location_id ?? "");
        }
        setRosterLocationNames(locLookup);
        if (!rosterLocationId) {
          const firstLoc = (locData.rows ?? [])[0];
          if (firstLoc) setRosterLocationId(String(firstLoc.location_id ?? ""));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeTableName, rosterLocationId]);

  useEffect(() => {
    if (activeTableName !== "roster" || !rosterLocationId) return;
    let cancelled = false;
    const dates = weekDatesFrom(rosterStartDate);
    const startDate = dates[0];
    const endDate = dates[6];
    (async () => {
      try {
        const [rosterRes, slotsRes, historyRes] = await Promise.all([
          fetch(`/api/table-data?table=roster&limit=100&locationId=${rosterLocationId}`).then((r) => r.json()),
          fetch(`/api/table-data?table=roster_slots&limit=1000`).then((r) => r.json()),
          fetch(`/api/table-data?table=roster_history&limit=500`).then((r) => r.json()),
        ]);
        if (cancelled) return;
        const rosterRows = (rosterRes.rows ?? []) as Record<string, unknown>[];
        const rosterRecord = rosterRows.find(
          (r) => String(r.location_id ?? "") === rosterLocationId
            && String(r.roster_date ?? "").slice(0, 10) === startDate,
        );
        if (rosterRecord) {
          setRosterIdentity(rosterRecord);
          setRosterCode(String(rosterRecord.roster_code ?? ""));
          setRosterStatus(String(rosterRecord.roster_status ?? "draft"));
          setRosterVersion(Number(rosterRecord.version ?? 1));
        }
        const slots = (slotsRes.rows ?? []) as Record<string, unknown>[];
        const slotMap: Record<string, string> = {};
        const slotMeta: Record<string, RosterSlot> = {};
        const locRosterIds = rosterRows
          .filter((r) => String(r.location_id ?? "") === rosterLocationId)
          .map((r) => String(r.roster_id ?? ""));
        const rosterDateById: Record<string, string> = {};
        for (const r of rosterRows) {
          const rid = String(r.roster_id ?? "");
          if (rid) rosterDateById[rid] = String(r.roster_date ?? "").slice(0, 10);
        }
        for (const s of slots) {
          const sRosterId = String(s.roster_id ?? "");
          if (!locRosterIds.includes(sRosterId)) continue;
          const sDate = rosterDateById[sRosterId] ?? "";
          const sEmpId = String(s.employee_id ?? "");
          const key = `${sEmpId}|${sDate}`;
          const slotType = String(s.slot_type ?? "regular");
          slotMap[key] = slotType;
          slotMeta[key] = {
            slot_id: String(s.slot_id ?? ""),
            roster_id: sRosterId,
            employee_id: sEmpId,
            slot_type: slotType,
            slot_start: String(s.slot_start ?? "").substring(0, 5),
            slot_end: String(s.slot_end ?? "").substring(0, 5),
            slot_status: String(s.slot_status ?? ""),
            is_keyholder: Boolean(s.is_keyholder),
            preference_applied: Boolean(s.preference_applied),
            preference_override: Boolean(s.preference_override),
          };
        }
        setRosterSlots(slotMap);
        setRosterSlotMeta(slotMeta);
        const historyRows = (historyRes.rows ?? []) as Record<string, unknown>[];
        setRosterHistory(
          historyRows
            .filter((h) => locRosterIds.includes(String(h.roster_id ?? "")))
            .map((h) => ({
              history_id: String(h.history_id ?? ""),
              roster_id: String(h.roster_id ?? ""),
              location_id: String(h.location_id ?? ""),
              roster_date: String(h.roster_date ?? "").slice(0, 10),
              version: Number(h.version ?? 0),
              change_reason: String(h.change_reason ?? ""),
              created_at: String(h.created_at ?? ""),
              action: String(h.action ?? ""),
              changed_by: String(h.changed_by ?? ""),
            }))
            .sort((a, b) => b.created_at.localeCompare(a.created_at)),
        );
      } catch { /* silently fail */ }
    })();
    return () => { cancelled = true; };
  }, [activeTableName, rosterLocationId, rosterStartDate, rosterRefreshKey]);

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

    if (activeTableName === "shift_policy_master") {
      if (!String(formState.policy_name ?? "").trim()) {
        setError("Shift Name is required");
        return;
      }
      const start = String(formState.shift_start_time ?? "").trim();
      const end = String(formState.shift_end_time ?? "").trim();
      if (start && end) {
        const [sh, sm] = start.split(":").map(Number);
        const [eh, em] = end.split(":").map(Number);
        if (eh * 60 + em <= sh * 60 + sm) {
          setError("Shift end time must be after start time");
          return;
        }
      }
      const sanctioned = Number(formState.sanctioned_strength ?? 0);
      if (sanctioned < 1) {
        setError("Required Staff Per Shift must be a positive number");
        return;
      }
      const maxConsecutive = Number(formState.max_consecutive_days ?? 0);
      if (maxConsecutive < 1) {
        setError("Max Continuous Working Days must be a positive number");
        return;
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

      if (activeTableName === "employee_master" && column === "location_id") {
        next.default_shift_id = "";
      }

      if (activeTableName === "shift_policy_master") {
        if (["shift_start_time", "shift_end_time", "break_duration_minutes"].includes(column)) {
          const start = String(next.shift_start_time ?? "").trim();
          const end = String(next.shift_end_time ?? "").trim();
          if (start && end) {
            const [sh, sm] = start.split(":").map(Number);
            const [eh, em] = end.split(":").map(Number);
            const totalMinutes = (eh * 60 + em) - (sh * 60 + sm);
            if (totalMinutes > 0) {
              const totalHours = +(totalMinutes / 60).toFixed(1);
              next.total_shift_hours = String(totalHours);
              const breakMin = Number(next.break_duration_minutes ?? 0);
              if (breakMin > 0 && breakMin < totalMinutes) {
                next.net_work_hours = String(+(totalHours - breakMin / 60).toFixed(1));
              }
            }
          }
        }
        if (column === "weekly_off_pattern" && String(value) === "rotational") {
          next.weekly_off_day = "";
        }
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

  // ─── roster planner helpers ─────────────────────────────────────────────────

  const SHIFT_META: Record<string, ShiftMeta> = useMemo(() => ({
    O: { label: "Opening", code: "O", time: "", className: "opening", policy: "" },
    C: { label: "Closing", code: "C", time: "", className: "closing", policy: "" },
    WO: { label: "Weekly Off", code: "WO", time: "Off", className: "off", policy: "" },
    AL: { label: "Approved Leave", code: "AL", time: "Leave", className: "leave", policy: "" },
  }), []);

  const openingPolicy = useMemo(
    () => rosterPolicies.find((p) => p.shift_category === "opening" && p.location_id === rosterLocationId),
    [rosterPolicies, rosterLocationId],
  );

  const closingPolicy = useMemo(
    () => rosterPolicies.find((p) => p.shift_category === "closing" && p.location_id === rosterLocationId),
    [rosterPolicies, rosterLocationId],
  );

  const rosterLocationEmployees = useMemo(
    () => rosterEmployees.filter((e) => e.location_id === rosterLocationId),
    [rosterEmployees, rosterLocationId],
  );

  const weekDatesFrom = (start: string) => {
    const [y, m, d] = start.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    return Array.from({ length: 7 }, (_, i) => {
      const next = new Date(date);
      next.setDate(date.getDate() + i);
      const yy = next.getFullYear();
      const mm = String(next.getMonth() + 1).padStart(2, "0");
      const dd = String(next.getDate()).padStart(2, "0");
      return `${yy}-${mm}-${dd}`;
    });
  };

  const rosterWeekDates = useMemo(() => weekDatesFrom(rosterStartDate), [rosterStartDate]);

  const rosterWeekLabel = useMemo(() => {
    const first = rosterWeekDates[0];
    const last = rosterWeekDates[6];
    const f = new Date(Number(first.slice(0, 4)), Number(first.slice(5, 7)) - 1, Number(first.slice(8, 10)));
    const l = new Date(Number(last.slice(0, 4)), Number(last.slice(5, 7)) - 1, Number(last.slice(8, 10)));
    const fText = f.toLocaleDateString("en-IN", { day: "numeric", month: f.getMonth() === l.getMonth() ? undefined : "long" as const });
    const lText = l.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" });
    return `${fText}-${lText}`;
  }, [rosterWeekDates]);

  const shortDay = (dateStr: string) => {
    const d = new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)));
    return d.toLocaleDateString("en-IN", { weekday: "short" });
  };

  const dateNumber = (dateStr: string) => Number(dateStr.slice(8, 10));

  const displayDate = (dateStr: string) => {
    const d = new Date(Number(dateStr.slice(0, 4)), Number(dateStr.slice(5, 7)) - 1, Number(dateStr.slice(8, 10)));
    return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  };

  const addDays = (start: string, days: number) => {
    const [y, m, d] = start.split("-").map(Number);
    const date = new Date(y, m - 1, d + days);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  };

  const getAssignment = (empId: string, date: string) => {
    const key = `${empId}|${date}`;
    return rosterSlots[key] || "";
  };

  const getSlotMeta = (empId: string, date: string) => {
    return rosterSlotMeta[`${empId}|${date}`];
  };

  const dailyCounts = (date: string) => {
    const counts = { O: 0, C: 0, WO: 0, AL: 0, keyO: 0, keyC: 0 };
    for (const emp of rosterLocationEmployees) {
      const val = getAssignment(emp.employee_id, date);
      if (val in counts) (counts as Record<string, number>)[val] += 1;
      const meta = getSlotMeta(emp.employee_id, date);
      if (meta?.is_keyholder && val === "O") counts.keyO += 1;
      if (meta?.is_keyholder && val === "C") counts.keyC += 1;
    }
    return counts;
  };

  const maximumWorkingStreak = (empId: string) => {
    let current = 0;
    let max = 0;
    for (const date of rosterWeekDates) {
      const val = getAssignment(empId, date);
      if (val === "O" || val === "C") { current++; max = Math.max(max, current); }
      else { current = 0; }
    }
    return max;
  };

  const isKeyholder = (empId: string) => {
    return rosterSlotMeta[`${empId}|${rosterWeekDates[0]}`]?.is_keyholder ?? false;
  };

  const validationResults = () => {
    const openingTarget = openingPolicy?.sanctioned_strength ?? 0;
    const closingTarget = closingPolicy?.sanctioned_strength ?? 0;
    const coverageShortage = rosterWeekDates.reduce((total, date) => {
      const counts = dailyCounts(date);
      return total + Math.max(0, openingTarget - counts.O) + Math.max(0, closingTarget - counts.C);
    }, 0);
    const keyholderGaps = rosterWeekDates.reduce((total, date) => {
      const counts = dailyCounts(date);
      return total
        + (openingPolicy?.keyholder_required && !counts.keyO ? 1 : 0)
        + (closingPolicy?.keyholder_required && !counts.keyC ? 1 : 0);
    }, 0);
    const consecutiveLimit = Math.min(
      openingPolicy?.max_consecutive_days ?? 99,
      closingPolicy?.max_consecutive_days ?? 99,
    );
    const consecutiveViolations = rosterLocationEmployees.filter((emp) => maximumWorkingStreak(emp.employee_id) > consecutiveLimit).length;
    const policiesOperational = openingPolicy?.policy_status === "Active"
      && closingPolicy?.policy_status === "Active";
    const shortageBlocks = coverageShortage > 0
      && (openingPolicy?.critical_store_flag || closingPolicy?.critical_store_flag);

    return [
      {
        name: "Shift timing and policy status",
        detail: policiesOperational
          ? "Opening and Closing policies are Active."
          : "Opening and Closing policies must be Active.",
        level: policiesOperational ? "pass" : "block",
        state: policiesOperational ? "Pass" : "Block",
      },
      {
        name: "Sanctioned shift strength",
        detail: coverageShortage
          ? `${coverageShortage} employee-position(s) remain open across the week.`
          : "Opening and Closing coverage targets are met.",
        level: shortageBlocks ? "block" : coverageShortage ? "warning" : "pass",
        state: shortageBlocks ? "Block" : coverageShortage ? "Review" : "Pass",
      },
      {
        name: "Keyholder coverage",
        detail: keyholderGaps
          ? `${keyholderGaps} shift(s) do not have an eligible keyholder.`
          : "Every operating shift has an eligible keyholder.",
        level: keyholderGaps ? "block" : "pass",
        state: keyholderGaps ? "Block" : "Pass",
      },
      {
        name: "Approved leave and hard restrictions",
        detail: "No employee is scheduled during approved leave.",
        level: "pass",
        state: "Pass",
      },
      {
        name: "Maximum consecutive days",
        detail: consecutiveViolations
          ? `${consecutiveViolations} employee(s) exceed the ${consecutiveLimit}-day work limit.`
          : `Weekly offs keep all employees within ${consecutiveLimit} consecutive days.`,
        level: consecutiveViolations ? "block" : "pass",
        state: consecutiveViolations ? "Block" : "Pass",
      },
    ];
  };

  const activePoliciesForLocation = useMemo(
    () => rosterPolicies.filter((p) => p.location_id === rosterLocationId),
    [rosterPolicies, rosterLocationId],
  );

  // Synced shift meta with actual policy times
  const syncedShiftMeta = useMemo(() => {
    const openPol = openingPolicy;
    const closePol = closingPolicy;
    return {
      O: { ...SHIFT_META.O, time: openPol ? `${openPol.shift_start_time}-${openPol.shift_end_time}` : "", policy: openPol?.policy_code ?? "" },
      C: { ...SHIFT_META.C, time: closePol ? `${closePol.shift_start_time}-${closePol.shift_end_time}` : "", policy: closePol?.policy_code ?? "" },
      WO: SHIFT_META.WO,
      AL: SHIFT_META.AL,
    } as Record<string, ShiftMeta>;
  }, [SHIFT_META, openingPolicy, closingPolicy]);

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
          {activeTableName === "roster" ? (
            <>
              {/* ── Roster Planner Header ─────────────────────────────────────── */}
              <header className="relative shrink-0 overflow-clip rounded-4xl border border-white/80 bg-white/70 p-6 shadow-[0_30px_90px_rgba(26,79,138,0.12)] backdrop-blur-2xl lg:p-8">
                <div className="absolute right-6 top-6 h-24 w-24 rounded-full bg-[#FFD700]/15 blur-2xl" />
                <div className="absolute bottom-0 right-1/3 h-36 w-36 rounded-full bg-[#2A7D5F]/12 blur-3xl" />
                <div className="relative">
                  <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                    <div>
                      <p className="inline-flex items-center gap-2 rounded-full border border-[#1A4F8A]/15 bg-[#1A4F8A]/6 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-[#1A4F8A]">Roster Planning</p>
                      <h2 className="font-display mt-4 text-4xl font-bold tracking-tight text-slate-950 sm:text-5xl">
                        {rosterLocationId ? `${rosterPolicies.find(p => p.location_id === rosterLocationId)?.policy_name || "Location"} Weekly Roster` : "Roster Planner"}
                      </h2>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" onClick={() => { const results = validationResults(); setNotice(results.filter(r => r.level === "block").length ? `${results.filter(r => r.level === "block").length} blocking issue(s) found` : "Roster validation completed"); }} className="rounded-full border border-[#1A4F8A]/20 bg-white px-5 py-3 text-sm font-semibold text-[#1A4F8A] shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                        Validate
                      </button>
                      <button type="button" onClick={() => { setGenLocationId(rosterLocationId); setGenStartDate(rosterStartDate); setGenerateOpen(true); }} className="rounded-full bg-[#2A7D5F] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(42,125,95,0.25)] transition hover:-translate-y-0.5 hover:bg-[#1f6a4e]">
                        Generate Roster
                      </button>
                    </div>
                  </div>

                  {/* ── Control Band ── */}
                  <div className="mt-6 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-4">
                    <div className="flex flex-wrap items-end gap-3">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Location</label>
                        <select value={rosterLocationId} onChange={(e) => setRosterLocationId(e.target.value)} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10 cursor-pointer min-w-[200px]">
                          <option value="">— Select —</option>
                          {Array.from(new Set(rosterPolicies.map(p => p.location_id))).filter(Boolean).map((lid) => (
                            <option key={lid} value={lid}>{rosterLocationNames[lid] ?? lid}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">Roster Week</label>
                        <input type="date" value={rosterStartDate} onChange={(e) => { setRosterStartDate(e.target.value); }} className="rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10" />
                      </div>
                      <button type="button" onClick={() => setRosterStartDate((p) => { const d = new Date(p); d.setDate(d.getDate() - 7); return d.toISOString().slice(0, 10); })} className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50" title="Previous week">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" /></svg>
                      </button>
                      <button type="button" onClick={() => setRosterStartDate((p) => { const d = new Date(p); d.setDate(d.getDate() + 7); return d.toISOString().slice(0, 10); })} className="rounded-full border border-slate-200 bg-white p-2.5 text-slate-600 hover:bg-slate-50" title="Next week">
                        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" /></svg>
                      </button>
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase ${rosterStatus === "published" ? "bg-green-50 text-[#2A7D5F]" : "bg-amber-50 text-amber-700"}`}>
                        <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" /></svg>
                        {rosterStatus === "published" ? "Published" : "Draft"} v{rosterVersion}
                      </span>
                      <p className="mt-1 text-xs text-slate-500">{rosterCode ? `Code: ${rosterCode}` : "No roster record yet"}</p>
                    </div>
                  </div>

                  {/* ── Summary Row ── */}
                  <div className="mt-4 grid grid-cols-3 gap-3 md:grid-cols-5">
                    {[
                      { label: "Roster ID", value: rosterCode || "—", detail: "Weekly plan" },
                      { label: "Active Shifts", value: activePoliciesForLocation.filter(p => p.policy_status === "Active").length, detail: `${activePoliciesForLocation.filter(p => p.shift_category === "opening").length ? "Opening" : ""}${activePoliciesForLocation.filter(p => p.shift_category === "opening").length && activePoliciesForLocation.filter(p => p.shift_category === "closing").length ? " + " : ""}${activePoliciesForLocation.filter(p => p.shift_category === "closing").length ? "Closing" : ""}` },
                      { label: "Employees", value: rosterLocationEmployees.length, detail: "Eligible at location" },
                      { label: "Open Positions", value: validationResults().reduce((s, r) => r.name === "Sanctioned shift strength" ? Number(r.detail.match(/\d+/)?.[0] || 0) : s, 0), detail: "Against sanctioned strength" },
                      { label: "Blocking Issues", value: validationResults().filter(r => r.level === "block").length, detail: "Must clear before publish" },
                    ].map((item) => (
                      <div key={item.label} className="rounded-2xl border border-white/80 bg-white/75 p-3 shadow-sm">
                        <p className="text-[10px] uppercase tracking-[0.24em] text-slate-500">{item.label}</p>
                        <p className="mt-1 text-xl font-bold text-slate-950">{item.value}</p>
                        <p className="text-[10px] text-slate-500">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </header>

              {/* ── View Tabs ── */}
              <div className="flex gap-6 border-b border-slate-200 px-1">
                {(["planner", "slots", "history"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setRosterView(tab)} className={`border-b-2 pb-3 text-xs font-bold uppercase tracking-[0.22em] transition ${rosterView === tab ? "border-[#2A7D5F] text-slate-900" : "border-transparent text-slate-500 hover:text-slate-700"}`}>
                    {tab === "planner" ? "Weekly Planner" : tab === "slots" ? "Roster Slots" : "History"}
                  </button>
                ))}
              </div>

              {/* ── Planner View ── */}
              {rosterView === "planner" && (
                <div className="space-y-6">
                  {/* Legend */}
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-bold text-slate-900">{rosterWeekLabel}</p>
                      <p className="text-xs text-slate-500">Click an employee slot to review or change the assignment.</p>
                    </div>
                    <div className="flex items-center gap-3 text-[10px] text-slate-500">
                      {[
                        { label: "Opening", cls: "bg-[#2F6173]" },
                        { label: "Closing", cls: "bg-[#286F56]" },
                        { label: "Weekly Off", cls: "bg-[#a3adb2]" },
                        { label: "Leave", cls: "bg-[#df6b35]" },
                      ].map((item) => (
                        <span key={item.label} className="flex items-center gap-1.5">
                          <span className={`h-2.5 w-2.5 rounded ${item.cls}`} />
                          {item.label}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Roster Grid */}
                  <div className="overflow-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
                    <table className="w-full min-w-[900px] border-separate border-spacing-0">
                      <thead>
                        <tr>
                          <th className="sticky left-0 z-10 w-56 border-b border-r border-slate-200 bg-slate-50 px-4 py-4 text-left text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">Employee</th>
                          {rosterWeekDates.map((date) => (
                            <th key={date} className="border-b border-r border-slate-200 bg-slate-50 px-3 py-4 text-center text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500 last:border-r-0">
                              {shortDay(date)}
                              <span className="ml-1 text-sm font-bold text-slate-900">{dateNumber(date)}</span>
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rosterLocationEmployees.length === 0 && (
                          <tr>
                            <td colSpan={8} className="px-4 py-12 text-center text-sm text-slate-500">No employees found for this location.</td>
                          </tr>
                        )}
                        {rosterLocationEmployees.map((emp) => {
                          const initials = [emp.first_name, emp.last_name].filter(Boolean).map((s) => s[0]).join("").toUpperCase();
                          const isKeyholder = rosterSlotMeta[`${emp.employee_id}|${rosterWeekDates[0]}`]?.is_keyholder || false;
                          return (
                            <tr key={emp.employee_id} className="border-b border-slate-100 transition hover:bg-slate-50/50">
                              <td className="sticky left-0 z-10 border-b border-r border-slate-100 bg-white px-4 py-3">
                                <div className="flex items-center gap-2.5">
                                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-200 text-[10px] font-bold text-slate-600">{initials}</div>
                                  <div>
                                    <p className="text-sm font-semibold text-slate-900">
                                      {emp.first_name} {emp.last_name}
                                      {isKeyholder && <span className="ml-1 text-amber-500" title="Keyholder">&#x1F511;</span>}
                                    </p>
                                    <p className="text-[10px] text-slate-500">{emp.designation_name || emp.role_name || ""}</p>
                                  </div>
                                </div>
                              </td>
                              {rosterWeekDates.map((date) => {
                                const assignment = getAssignment(emp.employee_id, date);
                                const meta = syncedShiftMeta[assignment];
                                if (!meta) {
                                  return (
                                    <td key={date} className="border-b border-r border-slate-100 px-2 py-2 text-center last:border-r-0">
                                      <button type="button" onClick={() => { setSlotEditTarget({ employeeId: emp.employee_id, date }); setSlotEditAssignment("O"); setSlotEditReason(""); setSlotEditOpen(true); }} className="w-full min-h-[44px] rounded-lg border border-transparent bg-transparent px-2 py-1.5 text-[10px] text-slate-400 hover:border-slate-300">
                                        —
                                      </button>
                                    </td>
                                  );
                                }
                                return (
                                  <td key={date} className="border-b border-r border-slate-100 px-2 py-2 text-center last:border-r-0">
                                    <button
                                      type="button"
                                      onClick={() => { setSlotEditTarget({ employeeId: emp.employee_id, date }); setSlotEditAssignment(assignment); setSlotEditReason(""); setSlotEditOpen(true); }}
                                      className={`w-full min-h-[44px] rounded-lg border px-2 py-1.5 text-center transition hover:border-slate-400 ${
                                        meta.className === "opening" ? "bg-[#e8f0f3] text-[#2F6173] border-transparent" :
                                        meta.className === "closing" ? "bg-[#e7f1ec] text-[#286F56] border-transparent" :
                                        meta.className === "off" ? "bg-[#edf0f1] text-[#68757b] border-transparent" :
                                        meta.className === "leave" ? "bg-[#fceee7] text-[#a64d27] border-transparent" :
                                        "bg-transparent text-slate-400 border-transparent"
                                      }`}
                                    >
                                      <span className="block text-xs font-bold">{meta.code}</span>
                                      <span className="block text-[9px] opacity-70">{meta.time}</span>
                                    </button>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Coverage Grid */}
                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-900">Daily Coverage</p>
                      <p className="text-xs text-slate-500">
                        Required: {openingPolicy?.sanctioned_strength ?? 0} Opening, {closingPolicy?.sanctioned_strength ?? 0} Closing
                        {(openingPolicy?.keyholder_required || closingPolicy?.keyholder_required) ? " + keyholder" : ""}
                      </p>
                    </div>
                    <div className="mt-2 grid grid-cols-7 gap-2 overflow-x-auto">
                      {rosterWeekDates.map((date) => {
                        const counts = dailyCounts(date);
                        const openingTarget = openingPolicy?.sanctioned_strength ?? 0;
                        const closingTarget = closingPolicy?.sanctioned_strength ?? 0;
                        return (
                          <div key={date} className="rounded-2xl border border-slate-200 bg-white p-3">
                            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{shortDay(date)} {dateNumber(date)}</p>
                            <div className="mt-2 space-y-1 text-[11px]">
                              <div className="flex justify-between"><span>Opening</span><strong className={counts.O >= openingTarget ? "text-[#2A7D5F]" : "text-red-600"}>{counts.O}/{openingTarget}</strong></div>
                              <div className="flex justify-between"><span>Closing</span><strong className={counts.C >= closingTarget ? "text-[#2A7D5F]" : "text-red-600"}>{counts.C}/{closingTarget}</strong></div>
                              <div className="flex justify-between"><span>Keyholders</span><strong className={counts.keyO + counts.keyC > 0 ? "text-[#2A7D5F]" : "text-red-600"}>{counts.keyO + counts.keyC}</strong></div>
                              <div className="flex justify-between"><span>Off/Leave</span><strong>{counts.WO + counts.AL}</strong></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Validation + Publish Panel */}
                  <div className="grid gap-6 xl:grid-cols-[1fr_280px]">
                    <div>
                      <p className="text-sm font-bold text-slate-900">Roster Validation</p>
                      <p className="text-xs text-slate-500">The system checks the generated slots before publication.</p>
                      <div className="mt-3 space-y-1">
                        {validationResults().map((r) => (
                          <div key={r.name} className={`flex items-center gap-3 border-b border-slate-100 py-3 text-sm ${
                            r.level === "pass" ? "text-[#2A7D5F]" : r.level === "warning" ? "text-amber-600" : "text-red-600"
                          }`}>
                            <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              {r.level === "pass" ? <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /> :
                               r.level === "warning" ? <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.072 16.5c-.77.833.192 2.5 1.732 2.5z" /> :
                               <path strokeLinecap="round" strokeLinejoin="round" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />}
                            </svg>
                            <div className="flex-1">
                              <p className="font-semibold">{r.name}</p>
                              <p className="text-xs text-slate-500">{r.detail}</p>
                            </div>
                            <span className={`text-[10px] font-bold uppercase ${
                              r.level === "pass" ? "text-[#2A7D5F]" : r.level === "warning" ? "text-amber-600" : "text-red-600"
                            }`}>{r.state}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                      <h3 className="text-base font-bold text-slate-900">Ready to Publish?</h3>
                      <p className="mt-2 text-xs text-slate-600">
                        {rosterStatus === "published"
                          ? "This version is published. Any further change must create a new audited version."
                          : validationResults().filter((r) => r.level === "block").length
                            ? `${validationResults().filter((r) => r.level === "block").length} blocking issue(s) must be resolved.`
                            : "All validation checks pass. The Draft can be published."}
                      </p>
                      <button
                        type="button"
                        disabled={rosterStatus === "published" || validationResults().filter((r) => r.level === "block").length > 0}
                        onClick={async () => {
                          if (!rosterIdentity) { setNotice("No roster record to publish"); return; }
                          try {
                            const res = await fetch("/api/table-data?table=roster", {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ recordId: String(rosterIdentity.roster_id ?? ""), roster_status: "published" }),
                            });
                            if (!res.ok) throw new Error("Publish failed");
                            setRosterStatus("published");
                            setNotice("Roster published successfully");
                          } catch { setNotice("Failed to publish roster"); }
                        }}
                        className="mt-4 w-full rounded-full bg-[#2F6173] px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-[#244d5c] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Publish Roster
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Slots View ── */}
              {rosterView === "slots" && (
                <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          {["Slot ID", "Roster ID", "Date", "Employee", "Shift Policy", "Assignment", "Status"].map((h) => (
                            <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rosterWeekDates.flatMap((date) =>
                          rosterLocationEmployees.map((emp) => {
                            const assignment = getAssignment(emp.employee_id, date);
                            if (!assignment) return null;
                            const meta = syncedShiftMeta[assignment];
                            const sMeta = rosterSlotMeta[`${emp.employee_id}|${date}`];
                            return (
                              <tr key={`${emp.employee_id}|${date}`} className="border-b border-slate-100 transition hover:bg-slate-50/50">
                                <td className="px-4 py-3 text-slate-500">{sMeta?.slot_id || "—"}</td>
                                <td className="px-4 py-3 text-slate-500">{rosterCode || "—"}</td>
                                <td className="px-4 py-3 text-slate-900">{date}</td>
                                <td className="px-4 py-3 text-slate-900">{emp.first_name} {emp.last_name}</td>
                                <td className="px-4 py-3 text-slate-500">{meta?.policy || "—"}</td>
                                <td className="px-4 py-3 text-slate-900">{meta?.label || assignment}</td>
                                <td className="px-4 py-3">
                                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${sMeta?.preference_override ? "bg-amber-50 text-amber-700" : "bg-green-50 text-[#2A7D5F]"}`}>
                                    {sMeta?.preference_override ? "Manual" : "Generated"}
                                  </span>
                                </td>
                              </tr>
                            );
                          }),
                        )}
                        {rosterWeekDates.flatMap((date) =>
                          rosterLocationEmployees.map((emp) => getAssignment(emp.employee_id, date) ? null : null),
                        ).length === 0 && rosterLocationEmployees.length > 0 && (
                          <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">No roster slots for this week. Generate a roster first.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* ── History View ── */}
              {rosterView === "history" && (
                <div className="rounded-3xl border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-auto">
                    <table className="w-full text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50">
                          {["Time", "Version", "Action", "Changed By", "Reason"].map((h) => (
                            <th key={h} className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.22em] text-slate-500">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rosterHistory.length === 0 ? (
                          <tr><td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">No history entries yet.</td></tr>
                        ) : (
                          rosterHistory.map((entry) => (
                            <tr key={entry.history_id} className="border-b border-slate-100 transition hover:bg-slate-50/50">
                              <td className="px-4 py-3 text-slate-500">{entry.created_at ? new Date(entry.created_at).toLocaleString("en-IN") : "—"}</td>
                              <td className="px-4 py-3 text-slate-900">v{entry.version}</td>
                              <td className="px-4 py-3 text-slate-900">{entry.action || "—"}</td>
                              <td className="px-4 py-3 text-slate-500">{entry.changed_by || "—"}</td>
                              <td className="px-4 py-3 text-slate-500">{entry.change_reason || "—"}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <>
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
                    {activeTableName === "employee_master" && (
                      <button
                        type="button"
                        onClick={() => { setImportOpen(true); setImportResult(null); }}
                        className="rounded-full bg-[#8B5CF6] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(139,92,246,0.25)] transition hover:-translate-y-0.5 hover:bg-[#7C3AED]"
                      >
                        Import Employees
                      </button>
                    )}
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
            </>
          )}
        </main>
      </div>

      {/* ── Generate Roster Modal ──────────────────────────────────────────── */}
      <AnimatePresence>
        {generateOpen && (
          <motion.div
            key="gen-overlay"
            variants={MODAL_OVERLAY}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 py-6 backdrop-blur-sm"
          >
            <motion.div
              key="gen-card"
              variants={MODAL_CARD}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex max-h-full w-full max-w-2xl flex-col rounded-3xl border border-white/70 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1A4F8A]">Generate Draft Roster</p>
                  <p className="text-sm text-slate-500 mt-1">The engine reads rules and creates editable Roster Slots.</p>
                </div>
                <button type="button" onClick={() => setGenerateOpen(false)} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-5 overflow-y-auto px-6 py-5">
                {/* Flow steps */}
                <div className="flex gap-2 rounded-2xl bg-slate-50 p-2">
                  {["Period", "Rules", "Availability", "Draft Slots"].map((step, i) => (
                    <div key={step} className="flex flex-1 items-center gap-2 rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#2A7D5F] shadow-sm">
                      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#2A7D5F] text-white text-[9px]">{i + 1}</span>
                      {step}
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-900">Location</span>
                    <select
                      value={genLocationId}
                      onChange={(e) => { setGenLocationId(e.target.value); setGenShiftPolicyId(""); }}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10"
                    >
                      <option value="">— Select —</option>
                      {Object.entries(genLocations).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-900">Week Starts</span>
                    <input
                      type="date"
                      value={genStartDate || rosterStartDate}
                      onChange={(e) => setGenStartDate(e.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10"
                    />
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-900">Roster Cycle</span>
                    <select defaultValue="weekly" className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10">
                      <option value="weekly">Weekly</option>
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-semibold text-slate-900">Generation Mode</span>
                    <select
                      value={genMode}
                      onChange={(e) => setGenMode(e.target.value)}
                      className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10"
                    >
                      <option value="balanced">Balanced rotation</option>
                      <option value="default">Prefer default shifts</option>
                    </select>
                  </label>
                </div>

                {/* Rule summary */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "Opening Policy", value: openingPolicy ? `${openingPolicy.policy_code} - ${openingPolicy.shift_start_time}-${openingPolicy.shift_end_time}` : "—" },
                    { label: "Closing Policy", value: closingPolicy ? `${closingPolicy.policy_code} - ${closingPolicy.shift_start_time}-${closingPolicy.shift_end_time}` : "—" },
                    { label: "Weekly Off", value: openingPolicy?.weekly_off_pattern || "—" },
                    { label: "Max Consecutive Days", value: openingPolicy ? `${openingPolicy.max_consecutive_days} days` : "—" },
                    { label: "Keyholder", value: (openingPolicy?.keyholder_required || closingPolicy?.keyholder_required) ? "Required per shift" : "Not required" },
                    { label: "Result", value: "Draft only" },
                  ].map((item) => (
                    <div key={item.label} className="rounded-2xl bg-slate-50 p-3">
                      <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">{item.label}</p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">{item.value}</p>
                    </div>
                  ))}
                </div>

                {/* Checks */}
                <div className="space-y-1">
                  <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-[#2A7D5F]">
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{activePoliciesForLocation.filter(p => p.policy_status === "Active").length} active Shift Policies found for the location</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-[#2A7D5F]">
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>{rosterLocationEmployees.length} active employees are eligible for roster planning</span>
                  </div>
                  <div className="flex items-center gap-2 rounded-xl bg-green-50 px-3 py-2 text-xs font-semibold text-[#2A7D5F]">
                    <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                    <span>Leave, restrictions, skills and keyholder eligibility will be checked</span>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setGenerateOpen(false)}
                  className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={genSubmitting || !genLocationId || !genStartDate || !rosterLocationEmployees.length}
                  onClick={async () => {
                    setGenSubmitting(true);
                    try {
                      const start = genStartDate ? new Date(genStartDate) : new Date(rosterStartDate);
                      const end = new Date(start);
                      end.setDate(end.getDate() + 6);
                      const startStr = start.toISOString().slice(0, 10);
                      const endStr = end.toISOString().slice(0, 10);
                      const holidayDates = new Set<string>();
                      const existingDates = new Set<string>();

                      const matchingEmployeeIds = new Set<string>();

                      await Promise.all([
                        fetch("/api/table-data?table=holiday_calendar&limit=500")
                          .then((r) => r.json())
                          .then((data) => {
                            for (const h of data.rows ?? []) {
                              if (String(h.location_id ?? "") === genLocationId) {
                                const d = (h.holiday_date ?? "").slice(0, 10);
                                if (d >= startStr && d <= endStr) holidayDates.add(d);
                              }
                            }
                          }),
                        fetch("/api/table-data?table=roster&limit=500")
                          .then((r) => r.json())
                          .then((data) => {
                            for (const r of data.rows ?? []) {
                              if (String(r.location_id ?? "") === genLocationId) {
                                existingDates.add((r.roster_date ?? "").slice(0, 10));
                              }
                            }
                          }),
                      ]);

                      rosterLocationEmployees.forEach((emp) => matchingEmployeeIds.add(emp.employee_id));

                      let created = 0;
                      let skipped = 0;
                      let slotsCreated = 0;
                      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
                        const dateStr = d.toISOString().slice(0, 10);
                        if (existingDates.has(dateStr)) { skipped++; continue; }
                        const dow = d.getDay();
                        const shiftCategory = genMode === "default" ? (rosterLocationEmployees.indexOf(rosterLocationEmployees[0]) % 2 === 0 ? "opening" : "closing") : "opening";
                        const policy = activePoliciesForLocation.find((p) => p.shift_category === shiftCategory);
                        if (!policy) { skipped++; continue; }
                        const body = {
                          location_id: genLocationId,
                          shift_policy_id: policy.policy_id,
                          roster_date: dateStr,
                          is_holiday: holidayDates.has(dateStr),
                          is_weekly_off: policy.weekly_off_day >= 0 && dow === policy.weekly_off_day,
                          available_staff_count: rosterLocationEmployees.length,
                          scenario: "standard",
                          roster_status: "draft",
                          version: 1,
                        };
                        const res = await fetch("/api/table-data?table=roster", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify(body),
                        });
                        if (res.ok) {
                          created++;
                          const result = await res.json() as { row: Record<string, unknown> };
                          const rosterId = String(result.row?.roster_id ?? "");
                          if (rosterId) {
                            await Promise.all(
                              Array.from(matchingEmployeeIds).map((empId) => {
                                const emp = rosterLocationEmployees.find((e) => e.employee_id === empId);
                                const prefDay = emp?.preferred_weekly_off_day;
                                const isPreferredOff = prefDay && Number(prefDay) % 7 === dow;
                                if (isPreferredOff) {
                                  return fetch("/api/table-data?table=roster_slots", {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({
                                      roster_id: rosterId,
                                      employee_id: empId,
                                      slot_type: "WO",
                                      preference_applied: true,
                                      slot_status: "scheduled",
                                    }),
                                  }).then((sr) => { if (sr.ok) slotsCreated++; });
                                }
                                const isEven = rosterLocationEmployees.findIndex((e) => e.employee_id === empId) % 2 === 0;
                                const slotType = genMode === "default"
                                  ? policy.shift_category
                                  : isEven ? "O" : "C";
                                const slotStart = isEven
                                  ? (openingPolicy?.shift_start_time ?? policy.shift_start_time)
                                  : (closingPolicy?.shift_start_time ?? policy.shift_start_time);
                                const slotEnd = isEven
                                  ? (openingPolicy?.shift_end_time ?? policy.shift_end_time)
                                  : (closingPolicy?.shift_end_time ?? policy.shift_end_time);
                                return fetch("/api/table-data?table=roster_slots", {
                                  method: "POST",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({
                                    roster_id: rosterId,
                                    employee_id: empId,
                                    slot_type: slotType,
                                    slot_start: slotStart,
                                    slot_end: slotEnd,
                                    preference_applied: true,
                                    slot_status: "scheduled",
                                  }),
                                }).then((sr) => { if (sr.ok) slotsCreated++; });
                              }),
                            );
                          }
                        } else { skipped++; }
                      }
                      setGenerateOpen(false);
                      if (created > 0) {
                        setRosterStartDate(startStr);
                        setRosterRefreshKey((k) => k + 1);
                        setNotice(`${created} roster record(s) created, ${slotsCreated} slot(s) auto-assigned.`);
                      } else {
                        setNotice("No new roster records created.");
                      }
                      setGenSubmitting(false);
                    } catch {
                      setGenSubmitting(false);
                    }
                  }}
                  className="rounded-full bg-[#2A7D5F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f6a4e] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {genSubmitting ? "Generating..." : "Generate Draft"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Slot Edit Modal ──────────────────────────────────────────────────── */}
      <AnimatePresence>
        {slotEditOpen && slotEditTarget && (
          <motion.div
            key="slot-overlay"
            variants={MODAL_OVERLAY}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 py-6 backdrop-blur-sm"
          >
            <motion.div
              key="slot-card"
              variants={MODAL_CARD}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex max-h-full w-full max-w-md flex-col rounded-3xl border border-white/70 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[#1A4F8A]">Edit Roster Slot</p>
                  <p className="mt-1 text-sm text-slate-500">
                    {rosterLocationEmployees.find((e) => e.employee_id === slotEditTarget.employeeId)?.first_name} {rosterLocationEmployees.find((e) => e.employee_id === slotEditTarget.employeeId)?.last_name} · {displayDate(slotEditTarget.date)}
                  </p>
                </div>
                <button type="button" onClick={() => { setSlotEditOpen(false); setSlotEditTarget(null); }} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600">
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex flex-col gap-5 px-6 py-5">
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-slate-900">Assignment</span>
                  <select
                    value={slotEditAssignment}
                    onChange={(e) => setSlotEditAssignment(e.target.value)}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10"
                  >
                    {openingPolicy && <option value="O">Opening · {openingPolicy.policy_code} · {openingPolicy.shift_start_time}-{openingPolicy.shift_end_time}</option>}
                    {closingPolicy && <option value="C">Closing · {closingPolicy.policy_code} · {closingPolicy.shift_start_time}-{closingPolicy.shift_end_time}</option>}
                    <option value="WO">Weekly Off</option>
                    <option value="AL">Approved Leave</option>
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-slate-900">Change Reason</span>
                  <textarea
                    value={slotEditReason}
                    onChange={(e) => setSlotEditReason(e.target.value)}
                    placeholder="Required for a manual roster change."
                    rows={3}
                    className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-[#1A4F8A] focus:ring-2 focus:ring-[#1A4F8A]/10 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => { setSlotEditOpen(false); setSlotEditTarget(null); }}
                  className="rounded-full border border-slate-200 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!slotEditReason.trim()}
                  onClick={async () => {
                    const { employeeId, date } = slotEditTarget!;
                    const prevAssignment = getAssignment(employeeId, date);
                    const prevMeta = rosterSlotMeta[`${employeeId}|${date}`];

                    try {
                      if (prevMeta?.slot_id) {
                        await fetch("/api/table-data?table=roster_slots", {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            recordId: prevMeta.slot_id,
                            slot_type: slotEditAssignment,
                            preference_override: true,
                          }),
                        });
                      }
                      if (rosterIdentity) {
                        await fetch("/api/table-data?table=roster_history", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            roster_id: String(rosterIdentity.roster_id ?? ""),
                            location_id: rosterLocationId,
                            roster_date: date,
                            version: rosterVersion,
                            action: "Roster slot changed",
                            changed_by: "HR Admin",
                            change_reason: `${rosterLocationEmployees.find((e) => e.employee_id === employeeId)?.first_name} ${rosterLocationEmployees.find((e) => e.employee_id === employeeId)?.last_name}: ${prevAssignment || "—"} to ${slotEditAssignment}. ${slotEditReason}`,
                          }),
                        });
                      }
                      setRosterSlots((prev) => ({ ...prev, [`${employeeId}|${date}`]: slotEditAssignment }));
                      setNotice("Roster slot updated and logged");
                    } catch {
                      setNotice("Failed to update roster slot");
                    }
                    setSlotEditOpen(false);
                    setSlotEditTarget(null);
                  }}
                  className="rounded-full bg-[#2A7D5F] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1f6a4e] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Save Change
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Import Employees Modal ─────────────────────────────────────────── */}
      <AnimatePresence>
        {importOpen && (
          <motion.div
            key="import-overlay"
            variants={MODAL_OVERLAY}
            initial="initial"
            animate="animate"
            exit="exit"
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/20 px-4 py-6 backdrop-blur-sm"
          >
            <motion.div
              key="import-card"
              variants={MODAL_CARD}
              initial="initial"
              animate="animate"
              exit="exit"
              className="flex max-h-full w-full max-w-lg flex-col rounded-3xl border border-white/70 bg-white shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5">
                <h2 className="text-lg font-bold text-slate-900">Import Employees</h2>
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto px-6 py-5 space-y-4">
                <p className="text-sm text-slate-600">
                  Upload a <strong>.csv</strong> or <strong>.xlsx</strong> file with employee data.
                  Column headers are matched by name; supported columns include:{" "}
                  <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">first name</code>,{" "}
                  <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">last name</code>,{" "}
                  <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">phone</code>,{" "}
                  <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">email</code>,{" "}
                  <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">gender</code>,{" "}
                  <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">department</code>,{" "}
                  <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">designation</code>,{" "}
                  <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">location</code>, etc.
                </p>
                <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-8 transition hover:border-[#8B5CF6] hover:bg-purple-50">
                  <svg className="mb-3 h-10 w-10 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                  <span className="text-sm font-medium text-slate-600">Click to select file</span>
                  <input
                    type="file"
                    accept=".csv,.xlsx"
                    className="hidden"
                    disabled={importSubmitting}
                    onChange={async (e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      setImportSubmitting(true);
                      setImportResult(null);
                      try {
                        const fd = new FormData();
                        fd.append("file", f);
                        const res = await fetch("/api/import/employees", { method: "POST", body: fd });
                        const data = await res.json();
                        if (!res.ok) throw new Error(data.error ?? "Import failed");
                        setImportResult(data);
                        await refreshTable();
                      } catch (err) {
                        setImportResult({ total: 0, created: 0, skipped: 0 });
                        setNotice(err instanceof Error ? err.message : "Import failed");
                      } finally {
                        setImportSubmitting(false);
                      }
                    }}
                  />
                </label>
                {importSubmitting && (
                  <div className="flex items-center justify-center py-4">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#8B5CF6] border-t-transparent" />
                    <span className="ml-3 text-sm text-slate-600">Importing...</span>
                  </div>
                )}
                {importResult && (
                  <div className="rounded-xl bg-slate-50 p-4 text-sm space-y-1">
                    <p className="font-medium text-slate-800">Import complete</p>
                    <p className="text-green-700">Created: {importResult.created}</p>
                    <p className="text-amber-700">Skipped: {importResult.skipped}</p>
                    <p className="text-slate-500">Total rows: {importResult.total}</p>
                  </div>
                )}
              </div>
              <div className="flex justify-end border-t border-slate-100 px-6 py-4">
                <button
                  type="button"
                  onClick={() => setImportOpen(false)}
                  className="rounded-full bg-slate-100 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

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
                    const hasStaticOpts = !isFkColumn && !useGeoSelect && Array.isArray(staticOpts) && staticOpts.length > 0 && (kind === "text" || column.column === "preferred_weekly_off_day");

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
                            {(activeTableName === "employee_transfer_history" && column.column === "to_location_id"
                              ? (fkOpts ?? []).filter((opt) => opt.value !== String(formState.from_location_id ?? ""))
                              : activeTableName === "shift_policy_master" && column.column === "backup_keyholder_id"
                                ? (fkOpts ?? []).filter((opt) => opt.value !== String(formState.primary_keyholder_id ?? ""))
                                : fkOpts
                            )?.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                          ) : useGeoSelect ? (
                          <select value={String(inputValue)} disabled={readOnly || isLockedBySameAddress || needsCountryForAddressField || needsStateForCity} onChange={(e) => updateForm(column.column, e.target.value)} className={selectClass}>
                            <option value="">{geoPlaceholder}</option>
                              {geoSelectOptions.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                          </select>
                        ) : hasStaticOpts ? (
                          <select value={String(inputValue)} disabled={readOnly || isLockedBySameAddress} onChange={(e) => updateForm(column.column, e.target.value)} className={selectClass}>
                            <option value="">— Select —</option>
                            {staticOpts.map((opt) => <option key={opt} value={opt}>{column.column === "preferred_weekly_off_day" ? (WEEKDAY_LABELS[opt] ?? opt) : formatLabel(opt)}</option>)}
                          </select>
                        ) : (
                          <input
                            type={kind === "datetime" ? "datetime-local" : kind === "date" ? "date" : kind === "time" ? "time" : kind === "number" ? "number" : "text"}
                            value={String(inputValue)}
                            readOnly={readOnly || isLockedBySameAddress || (activeTableName === "shift_policy_master" && column.column === "weekly_off_day" && String(formState.weekly_off_pattern ?? "") === "rotational")}
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
                          {readOnly && !isLockedBySameAddress ? " Auto-generated by the database." : ""}
                          {activeTableName === "shift_policy_master" && column.column === "weekly_off_day" && String(formState.weekly_off_pattern ?? "") === "rotational" ? " Not applicable for Rotational weekly off." : ""}
                          {activeTableName === "shift_policy_master" && (column.column === "total_shift_hours" || column.column === "net_work_hours") ? " Calculated from shift timing and break." : ""}
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
