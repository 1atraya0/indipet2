export const HIGH_POWER_ACTIONS = [
  "Delete",
  "Approve",
  "Export",
  "Run Payroll",
  "Correct Attendance",
] as const;

export type HighPowerAction = (typeof HIGH_POWER_ACTIONS)[number];

const GRADE_ORDER: Record<string, number> = {
  A: 4,
  B: 3,
  C: 2,
  D: 1,
};

export function normalizeGradeCode(value: unknown) {
  return String(value ?? "").trim().toUpperCase();
}

export function getEffectiveDesignationGrade(row: { grade_code?: unknown; override_grade_code?: unknown }) {
  const overrideGrade = normalizeGradeCode(row.override_grade_code);
  if (overrideGrade) {
    return overrideGrade;
  }

  return normalizeGradeCode(row.grade_code);
}

export function isHighPowerAction(action: string): action is HighPowerAction {
  return (HIGH_POWER_ACTIONS as readonly string[]).includes(action);
}

export function isGradeAtOrAbove(currentGrade: string, requiredGrade: string) {
  const currentRank = GRADE_ORDER[normalizeGradeCode(currentGrade)] ?? 0;
  const requiredRank = GRADE_ORDER[normalizeGradeCode(requiredGrade)] ?? 0;
  return currentRank >= requiredRank;
}