import { getCurrentUser } from "@/lib/authService";
import { safeJsonParse } from "@/lib/safeJson";

const changeHistoryKey = "funeral-handoff-change-history-v1";

export type ChangeHistoryTargetType =
  | "case"
  | "vendorRule"
  | "extraQuestion"
  | "vendor"
  | "branch"
  | "user"
  | "systemSetting"
  | "caseStatus"
  | "postWork"
  | "handoffNote";

export type ChangeHistoryOperation = "create" | "update" | "disable" | "restore" | "delete";

export type ChangeHistoryEntry = {
  id: string;
  targetType: ChangeHistoryTargetType;
  targetId: string;
  caseId?: string;
  fieldName: string;
  beforeValue: unknown;
  afterValue: unknown;
  operation: ChangeHistoryOperation;
  changedByUserId: string;
  changedByName: string;
  changedByRole: string;
  changedByBranchId: string;
  changedAt: string;
  reason?: string;
};

function canUseStorage() {
  return typeof window !== "undefined";
}

function historyId() {
  return `history_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function getChangeHistory() {
  if (!canUseStorage()) return [];
  const raw = window.localStorage.getItem(changeHistoryKey);
  return safeJsonParse<ChangeHistoryEntry[]>(raw, {
    fallback: [],
    label: "changeHistoryService.getChangeHistory"
  });
}

export function recordChangeHistory(entry: Omit<ChangeHistoryEntry, "id" | "changedAt" | "changedByUserId" | "changedByName" | "changedByRole" | "changedByBranchId">) {
  if (!canUseStorage()) return;
  const user = getCurrentUser();
  const nextEntry: ChangeHistoryEntry = {
    id: historyId(),
    changedAt: new Date().toISOString(),
    changedByUserId: user?.userId || "",
    changedByName: user?.name || "",
    changedByRole: user?.role || "",
    changedByBranchId: user?.branchId || user?.branchIds?.[0] || "",
    ...entry
  };
  const history = [...getChangeHistory(), nextEntry].slice(-1000);
  window.localStorage.setItem(changeHistoryKey, JSON.stringify(history));
}
