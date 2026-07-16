import { defaultData } from "@/lib/defaultData";
import { downloadJsonFile, sanitizeFileName } from "@/lib/downloadService";
import {
  deleteHandoffRecordFromCloud,
  getCloudHandoffRecords,
  isCloudSaveAvailable,
  saveHandoffRecordToCloud,
  subscribeCloudHandoffRecords
} from "@/lib/firebaseHandoffRepository";
import { getCurrentUser, type AuthUser } from "@/lib/authService";
import { getBranches, getVendorMap, getVendorRule, type VendorRule } from "@/lib/masterDataService";
import { safeJsonParse } from "@/lib/safeJson";
import type { HandoffData } from "@/types/form";

const recordsKey = "funeral-handoff-records-v1";
const recordsUpdatedEventName = "funeral-handoff-records-updated";
const editingDraftKey = "funeral-handoff-draft-v3";
const editingStepKey = "funeral-handoff-edit-step";
const editingRecordIdKey = "funeral-handoff-edit-record-id";
const activeEditingRecordIdKey = "funeral-handoff-active-edit-record-id";
const totalHandoffSteps = 15;
const cloudSyncTimeoutMs = 10000;
const staleSyncingMs = 15000;
const editLockTimeoutMs = 15 * 60 * 1000;

export type HandoffRecordStatus = "入力中" | "現場入力完了" | "業務終了後入力済み" | "控え作成済み" | "送信済み" | "完了";
export type HandoffSyncStatus = "synced" | "offline_pending" | "syncing" | "sync_failed";

export function getNetworkStatus() {
  if (typeof navigator === "undefined") return "online";
  return navigator.onLine ? "online" : "offline";
}

export function syncStatusLabel(status: HandoffSyncStatus) {
  const labels: Record<HandoffSyncStatus, string> = {
    synced: "クラウド同期済み",
    offline_pending: "クラウド同期待ち",
    syncing: "同期中",
    sync_failed: "同期エラー"
  };
  return labels[status];
}

export function normalizeHandoffStatus(status: string): HandoffRecordStatus {
  if (["親族入力中", "ドライバー入力中", "親族確認待ち", "親族確認完了"].includes(status)) return "入力中";
  if (["管理処理中", "業務終了後入力待ち", "現場入力完了"].includes(status)) return "現場入力完了";
  if (["業務完了"].includes(status)) return "業務終了後入力済み";
  if (["業者控え作成済み", "社内控え作成済み", "PDF作成済み"].includes(status)) return "控え作成済み";
  if (status === "送信済み") return "送信済み";
  if (status === "完了") return "完了";
  return "入力中";
}

function progressPercentForStep(step: number) {
  return Math.min(60, Math.max(7, Math.round(((step + 1) / totalHandoffSteps) * 60)));
}

export function progressPercentForStatus(status: HandoffRecordStatus, progress?: { currentStep?: number; progressPercent?: number } | null) {
  if (status === "完了") return 100;
  if (status === "送信済み") return 95;
  if (status === "控え作成済み") return 85;
  if (status === "業務終了後入力済み") return 75;
  if (status === "現場入力完了") return 65;

  const savedPercent = Number.isFinite(progress?.progressPercent) ? progress?.progressPercent || 0 : 0;
  if (savedPercent > 0) return Math.min(60, Math.max(7, savedPercent));
  const currentStep = Number.isFinite(progress?.currentStep) ? progress?.currentStep || 0 : 0;
  return progressPercentForStep(currentStep);
}

function fallbackStepForStatus(status: HandoffRecordStatus) {
  return status === "入力中" ? 0 : totalHandoffSteps - 1;
}

function normalizeProgressPercent(progress: HandoffRecord["handoffProgress"], status: HandoffRecordStatus) {
  if (!progress) {
    const currentStep = fallbackStepForStatus(status);
    return {
      currentStep,
      currentStepName: status,
      progressPercent: progressPercentForStatus(status, { currentStep }),
      lastSavedAt: ""
    };
  }
  const rawStep = Number.isFinite(progress.currentStep) ? progress.currentStep : 0;
  const currentStep = rawStep > 0 ? rawStep : fallbackStepForStatus(status);
  return {
    ...progress,
    currentStep,
    currentStepName: status,
    progressPercent: progressPercentForStatus(status, { currentStep, progressPercent: progress.progressPercent })
  };
}

export type HandoffRecord = {
  id: string;
  status: HandoffRecordStatus;
  branchId: string;
  branchName: string;
  vendorId: string;
  vendorName: string;
  deceasedName: string;
  mournerName: string;
  cremationReservationStatus: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  submittedAt: string | null;
  createdBy: AuthUser | null;
  updatedBy: AuthUser | null;
  assignedDriver: { userId: string; name: string } | null;
  editingByUid?: string;
  editingByName?: string;
  editingStartedAt?: string;
  editingHeartbeatAt?: string;
  syncStatus: HandoffSyncStatus;
  lastSavedLocalAt: string;
  lastSyncedAt: string | null;
  syncError: string;
  handoffProgress: {
    currentStep: number;
    currentStepName: string;
    progressPercent: number;
    lastSavedAt: string;
  } | null;
  masterSnapshot: {
    branch: { id: string; name: string } | null;
    vendor: { id: string; name: string; funeralCompanyContact: string } | null;
    vendorRule: VendorRule | null;
  };
  data: HandoffData;
  pdf: {
    generated: boolean;
    fileName: string;
    url: string;
  };
};

export type HandoffEditLock = {
  editingByUid: string;
  editingByName: string;
  editingStartedAt: string;
  editingHeartbeatAt: string;
  expired: boolean;
};

export function isEditLockExpired(record: Pick<HandoffRecord, "editingHeartbeatAt">, now = Date.now()) {
  if (!record.editingHeartbeatAt) return true;
  const heartbeatAt = new Date(record.editingHeartbeatAt).getTime();
  return !Number.isFinite(heartbeatAt) || now - heartbeatAt > editLockTimeoutMs;
}

export function getActiveEditLock(record: HandoffRecord, now = Date.now()): HandoffEditLock | null {
  if (!record.editingByUid || !record.editingHeartbeatAt) return null;
  const expired = isEditLockExpired(record, now);
  if (expired) return null;
  return {
    editingByUid: record.editingByUid,
    editingByName: record.editingByName || "他の担当者",
    editingStartedAt: record.editingStartedAt || record.editingHeartbeatAt,
    editingHeartbeatAt: record.editingHeartbeatAt,
    expired
  };
}

export function isRecordEditedByOther(record: HandoffRecord, user: AuthUser | null = getCurrentUser()) {
  const lock = getActiveEditLock(record);
  return Boolean(lock && (!user || lock.editingByUid !== user.userId));
}

export function editLockDisplay(record: HandoffRecord) {
  const lock = getActiveEditLock(record);
  if (!lock) return { label: "未編集中", lastActiveAt: "", locked: false };
  return {
    label: `${lock.editingByName}さんが編集中`,
    lastActiveAt: lock.editingHeartbeatAt,
    locked: true
  };
}

function syncFieldsForLocalSave(existing: HandoffRecord | undefined, now: string) {
  const online = getNetworkStatus() === "online";
  const cloudAvailable = isCloudSaveAvailable();
  return {
    syncStatus: cloudAvailable ? (online ? "syncing" as HandoffSyncStatus : "offline_pending" as HandoffSyncStatus) : "sync_failed" as HandoffSyncStatus,
    lastSavedLocalAt: now,
    lastSyncedAt: cloudAvailable ? existing?.lastSyncedAt || null : online ? now : existing?.lastSyncedAt || null,
    syncError: cloudAvailable ? "" : "Firebase設定が未登録です。端末内に保存しました。"
  };
}

function persistRecord(record: HandoffRecord) {
  const records = getHandoffRecords();
  const nextRecords = records.some((item) => item.id === record.id)
    ? records.map((item) => item.id === record.id ? record : item)
    : [record, ...records];
  saveRecords(nextRecords);
  if (isCloudSaveAvailable() && getNetworkStatus() === "online") {
    queueCloudSync(record);
  }
}

function assertEditLockOwner(existing: HandoffRecord | undefined, user: AuthUser | null) {
  if (!existing) return;
  const lock = getActiveEditLock(existing);
  if (!lock || lock.editingByUid === user?.userId) return;
  throw new Error(`${lock.editingByName}さんが編集中のため保存できません。必要な場合は編集を引き継いでください。`);
}

export function acquireHandoffEditLock(recordId: string, options: { takeover?: boolean } = {}) {
  if (!canUseStorage()) return null;
  const user = getCurrentUser();
  if (!user) return null;
  const records = getHandoffRecords();
  const existing = records.find((record) => record.id === recordId);
  if (!existing) return null;
  const lock = getActiveEditLock(existing);
  if (lock && lock.editingByUid !== user.userId && !options.takeover) return existing;

  const now = new Date().toISOString();
  const next: HandoffRecord = {
    ...existing,
    ...syncFieldsForLocalSave(existing, now),
    editingByUid: user.userId,
    editingByName: user.name,
    editingStartedAt: lock?.editingByUid === user.userId ? existing.editingStartedAt || now : now,
    editingHeartbeatAt: now
  };
  window.localStorage.setItem(activeEditingRecordIdKey, recordId);
  persistRecord(next);
  return next;
}

export function touchHandoffEditLock(recordId: string) {
  if (!canUseStorage()) return;
  const user = getCurrentUser();
  if (!user) return;
  const existing = getHandoffRecordById(recordId);
  if (!existing || existing.editingByUid !== user.userId) return;
  const now = new Date().toISOString();
  persistRecord({
    ...existing,
    ...syncFieldsForLocalSave(existing, now),
    editingHeartbeatAt: now
  });
}

export function releaseHandoffEditLock(recordId: string) {
  if (!canUseStorage()) return;
  const user = getCurrentUser();
  const existing = getHandoffRecordById(recordId);
  if (!existing || (existing.editingByUid && existing.editingByUid !== user?.userId)) return;
  const now = new Date().toISOString();
  persistRecord({
    ...existing,
    ...syncFieldsForLocalSave(existing, now),
    editingByUid: "",
    editingByName: "",
    editingStartedAt: "",
    editingHeartbeatAt: ""
  });
  window.localStorage.removeItem(activeEditingRecordIdKey);
}

export function releaseCurrentEditingLock() {
  if (!canUseStorage()) return;
  const recordId = window.localStorage.getItem(activeEditingRecordIdKey) || window.localStorage.getItem(editingRecordIdKey);
  if (recordId) releaseHandoffEditLock(recordId);
}

export function nextActionForRecord(record: HandoffRecord) {
  if (record.status === "完了") return "対応終了";
  if (record.status === "入力中") return "入力を再開する";
  if (record.status === "現場入力完了" && !record.data.postWork.savedAt) return "業務終了後入力を行う";
  if (!record.data.vendorCopy.generated) return "業者控えPDFを作成する";
  if (!record.data.internalCopy.generated) return "社内控えPDFを作成する";
  if (!record.data.internalCopy.sent) return "社内保管済みにする";
  return "完了にする";
}

export type SaveHandoffRecordOptions = {
  id?: string;
  status: HandoffRecordStatus;
  pdfGenerated?: boolean;
  currentStep?: number;
  currentStepName?: string;
  progressPercent?: number;
};

function canUseStorage() {
  return typeof window !== "undefined";
}

function saveRecords(records: HandoffRecord[]) {
  window.localStorage.setItem(recordsKey, JSON.stringify(records));
  window.dispatchEvent(new CustomEvent(recordsUpdatedEventName));
}

function normalizeRecord(record: HandoffRecord): HandoffRecord {
  const createdBy = record.createdBy || null;
  const status = normalizeHandoffStatus(record.status);
  const lockExpired = isEditLockExpired(record);
  return {
    ...record,
    status,
    completedAt: record.completedAt || null,
    submittedAt: record.submittedAt || null,
    createdBy,
    updatedBy: record.updatedBy || null,
    assignedDriver: record.assignedDriver || (createdBy?.role === "staff" ? { userId: createdBy.userId, name: createdBy.name } : null),
    editingByUid: lockExpired ? "" : record.editingByUid || "",
    editingByName: lockExpired ? "" : record.editingByName || "",
    editingStartedAt: lockExpired ? "" : record.editingStartedAt || "",
    editingHeartbeatAt: lockExpired ? "" : record.editingHeartbeatAt || "",
    syncStatus: isStaleSyncing(record) ? "offline_pending" : record.syncStatus || "synced",
    lastSavedLocalAt: record.lastSavedLocalAt || record.updatedAt,
    lastSyncedAt: record.lastSyncedAt || null,
    syncError: isStaleSyncing(record) ? "繧ｯ繝ｩ繧ｦ繝牙酔譛溘↓譎る俣縺後°縺九▲縺ｦ縺・∪縺吶ょ・蜷梧悄蠕・■縺ｧ縺吶・" : record.syncError || "",
    handoffProgress: normalizeProgressPercent(record.handoffProgress, status),
    masterSnapshot: record.masterSnapshot || { branch: null, vendor: null, vendorRule: null },
    data: withDataDefaults(record.data)
  };
}

function recordTimestamp(record: Pick<HandoffRecord, "updatedAt" | "lastSavedLocalAt" | "lastSyncedAt">) {
  const value = record.updatedAt || record.lastSavedLocalAt || record.lastSyncedAt || "";
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function shouldKeepLocalRecord(localRecord: HandoffRecord, cloudRecord: HandoffRecord) {
  const localHasUnsyncedWork = localRecord.syncStatus === "offline_pending" || localRecord.syncStatus === "sync_failed" || localRecord.syncStatus === "syncing";
  if (localHasUnsyncedWork && recordTimestamp(localRecord) >= recordTimestamp(cloudRecord)) return true;
  return recordTimestamp(localRecord) > recordTimestamp(cloudRecord);
}

function mergeCloudRecordsIntoLocal(cloudRecords: HandoffRecord[], pruneSyncedMissing = false) {
  if (!canUseStorage()) return [];
  const byId = new Map<string, HandoffRecord>();
  const cloudIds = new Set(cloudRecords.map((record) => record.id));
  getHandoffRecords().forEach((record) => {
    if (pruneSyncedMissing && record.syncStatus === "synced" && !cloudIds.has(record.id)) return;
    byId.set(record.id, record);
  });

  cloudRecords.forEach((rawRecord) => {
    const cloudRecord = normalizeRecord({
      ...rawRecord,
      syncStatus: "synced",
      syncError: "",
      lastSyncedAt: rawRecord.lastSyncedAt || new Date().toISOString()
    });
    const localRecord = byId.get(cloudRecord.id);
    if (!localRecord || !shouldKeepLocalRecord(localRecord, cloudRecord)) {
      byId.set(cloudRecord.id, cloudRecord);
    }
  });

  const merged = Array.from(byId.values()).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  saveRecords(merged);
  return merged;
}

function isStaleSyncing(record: Pick<HandoffRecord, "syncStatus" | "lastSavedLocalAt">) {
  if (record.syncStatus !== "syncing") return false;
  const savedAt = new Date(record.lastSavedLocalAt).getTime();
  return Number.isFinite(savedAt) && Date.now() - savedAt > staleSyncingMs;
}

const cloudSyncPendingMessage = "クラウド同期に時間がかかっています。端末保存済みです。";

function queueCloudSync(record: HandoffRecord) {
  console.info("[Cloud sync] queued.", { recordId: record.id, status: record.status });
  let settled = false;
  const timer = window.setTimeout(() => {
    if (!settled) {
      console.warn("[Cloud sync] still pending after timeout.", { recordId: record.id, timeoutMs: cloudSyncTimeoutMs });
      markRecordSyncPending(record.id, cloudSyncPendingMessage);
    }
  }, cloudSyncTimeoutMs);

  void saveHandoffRecordToCloud(record)
    .then(() => {
      settled = true;
      window.clearTimeout(timer);
      console.info("[Cloud sync] completed.", { recordId: record.id });
      markRecordSynced(record.id);
    })
    .catch((error) => {
      settled = true;
      window.clearTimeout(timer);
      console.error("[Cloud sync] failed.", { recordId: record.id, error });
      markRecordSyncFailed(record.id, error instanceof Error ? error.message : "クラウド同期に失敗しました。");
    });
}

function syncRecordWithPendingFallback(record: HandoffRecord) {
  return new Promise<{ id: string; result: "synced" | "pending" | "failed"; message: string }>((resolve) => {
    console.info("[Cloud sync] manual sync started.", { recordId: record.id });
    let resolved = false;
    const timer = window.setTimeout(() => {
      if (resolved) return;
      resolved = true;
      console.warn("[Cloud sync] manual sync still pending after timeout.", {
        recordId: record.id,
        timeoutMs: cloudSyncTimeoutMs
      });
      markRecordSyncPending(record.id, cloudSyncPendingMessage);
      resolve({ id: record.id, result: "pending", message: cloudSyncPendingMessage });
    }, cloudSyncTimeoutMs);

    void saveHandoffRecordToCloud(record)
      .then(() => {
        window.clearTimeout(timer);
        markRecordSynced(record.id);
        console.info("[Cloud sync] manual sync completed.", { recordId: record.id });
        if (!resolved) {
          resolved = true;
          resolve({ id: record.id, result: "synced", message: "" });
        }
      })
      .catch((error) => {
        window.clearTimeout(timer);
        const message = error instanceof Error ? error.message : "クラウド同期に失敗しました。";
        console.error("[Cloud sync] manual sync failed.", { recordId: record.id, message, error });
        markRecordSyncFailed(record.id, message);
        if (!resolved) {
          resolved = true;
          resolve({ id: record.id, result: "failed", message });
        }
      });
  });
}

function buildId() {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `handoff_${stamp}_${Math.random().toString(36).slice(2, 6)}`;
}

function pdfFileName(data: HandoffData, vendorName: string) {
  return `業務引継書_${vendorName || "業者未選択"}_${data.deceased.name || "未入力"}.pdf`;
}

function withDataDefaults(data: HandoffData): HandoffData {
  const base = structuredClone(defaultData);
  return {
    ...base,
    ...data,
    chiefMourner: { ...base.chiefMourner, ...data.chiefMourner },
    deceased: { ...base.deceased, ...data.deceased },
    transport: { ...base.transport, ...data.transport },
    religion: { ...base.religion, ...data.religion },
    schedule: { ...base.schedule, ...data.schedule },
    supplies: { ...base.supplies, ...data.supplies },
    contactAndNotes: { ...base.contactAndNotes, ...data.contactAndNotes },
    handoffNotes: { ...base.handoffNotes, ...data.handoffNotes },
    relativeCopy: { ...base.relativeCopy, ...data.relativeCopy },
    vendorCopy: { ...base.vendorCopy, ...data.vendorCopy },
    internalCopy: { ...base.internalCopy, ...data.internalCopy },
    relativeConfirmation: { ...base.relativeConfirmation, ...data.relativeConfirmation },
    familyCopyDelivery: { ...base.familyCopyDelivery, ...data.familyCopyDelivery },
    privacyConsent: { ...base.privacyConsent, ...data.privacyConsent },
    postWork: { ...base.postWork, ...data.postWork, savedBy: { ...base.postWork.savedBy, ...data.postWork?.savedBy } },
    consent: { ...base.consent, ...data.consent }
  };
}

export function getHandoffRecords(): HandoffRecord[] {
  if (!canUseStorage()) return [];
  try {
    const records = safeJsonParse<HandoffRecord[]>(window.localStorage.getItem(recordsKey), {
      fallback: [],
      label: "handoffStorage.getHandoffRecords localStorage records"
    });
    return records.map((record) => normalizeRecord(record)).sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    return records
      .map((record) => {
        const createdBy = record.createdBy || null;
        const status = normalizeHandoffStatus(record.status);
        return {
          ...record,
          status,
          completedAt: record.completedAt || null,
          submittedAt: record.submittedAt || null,
          createdBy,
          updatedBy: record.updatedBy || null,
          assignedDriver: record.assignedDriver || (createdBy?.role === "staff" ? { userId: createdBy.userId, name: createdBy.name } : null),
          syncStatus: isStaleSyncing(record) ? "offline_pending" : record.syncStatus || "synced",
          lastSavedLocalAt: record.lastSavedLocalAt || record.updatedAt,
          lastSyncedAt: record.lastSyncedAt || null,
          syncError: isStaleSyncing(record) ? "クラウド同期に時間がかかっています。再同期待ちです。" : record.syncError || "",
          handoffProgress: normalizeProgressPercent(record.handoffProgress, status),
          masterSnapshot: record.masterSnapshot || { branch: null, vendor: null, vendorRule: null },
          data: withDataDefaults(record.data)
        };
      })
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  } catch {
    return [];
  }
}

export function getHandoffRecordById(id: string) {
  return getHandoffRecords().find((record) => record.id === id);
}

export function saveHandoffRecord(data: HandoffData, options: SaveHandoffRecordOptions): HandoffRecord {
  if (!canUseStorage()) throw new Error("この環境では保存できません。");

  const now = new Date().toISOString();
  const records = getHandoffRecords();
  const existing = options.id ? records.find((record) => record.id === options.id) : undefined;
  const branch = getBranches().find((item) => item.id === data.branchId);
  const vendor = getVendorMap()[data.vendorId];
  const vendorRule = data.vendorId ? getVendorRule(data.vendorId) : null;
  const branchName = branch?.name || "未選択";
  const vendorName = vendor?.name || "業者未選択";
  const generated = options.pdfGenerated || existing?.pdf.generated || false;
  const currentUser = getCurrentUser();
  assertEditLockOwner(existing, currentUser);
  const createdBy = existing?.createdBy || currentUser;
  const status = normalizeHandoffStatus(options.status);
  const online = getNetworkStatus() === "online";
  const cloudAvailable = isCloudSaveAvailable();
  const record: HandoffRecord = {
    id: existing?.id || buildId(),
    status,
    branchId: data.branchId,
    branchName,
    vendorId: data.vendorId,
    vendorName,
    deceasedName: data.deceased.name,
    mournerName: data.chiefMourner.name,
    cremationReservationStatus: data.schedule.cremationReservationStatus,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
    completedAt: status !== "入力中" ? existing?.completedAt || now : existing?.completedAt || null,
    submittedAt: status === "送信済み" || status === "完了" ? now : existing?.submittedAt || null,
    createdBy,
    updatedBy: currentUser,
    assignedDriver: existing?.assignedDriver || (createdBy?.role === "staff" ? { userId: createdBy.userId, name: createdBy.name } : null),
    editingByUid: existing?.editingByUid || "",
    editingByName: existing?.editingByName || "",
    editingStartedAt: existing?.editingStartedAt || "",
    editingHeartbeatAt: existing?.editingByUid === currentUser?.userId ? now : existing?.editingHeartbeatAt || "",
    syncStatus: cloudAvailable ? (online ? "syncing" : "offline_pending") : "sync_failed",
    lastSavedLocalAt: now,
    lastSyncedAt: cloudAvailable ? existing?.lastSyncedAt || null : online ? now : existing?.lastSyncedAt || null,
    syncError: cloudAvailable ? "" : "Firebase設定が未登録です。端末内に保存しました。",
    handoffProgress: typeof options.currentStep === "number"
      ? {
          currentStep: options.currentStep,
          currentStepName: status,
          progressPercent: progressPercentForStatus(status, { currentStep: options.currentStep, progressPercent: options.progressPercent }),
          lastSavedAt: now
        }
      : normalizeProgressPercent(existing?.handoffProgress || null, status),
    masterSnapshot: {
      branch: branch ? { id: branch.id, name: branch.name } : null,
      vendor: vendor ? { id: vendor.id, name: vendor.name, funeralCompanyContact: vendor.funeralCompanyContact } : null,
      vendorRule
    },
    data: structuredClone(data),
    pdf: {
      generated,
      fileName: generated ? pdfFileName(data, vendorName) : "",
      url: ""
    }
  };
  const nextRecords = existing ? records.map((item) => item.id === record.id ? record : item) : [record, ...records];
  saveRecords(nextRecords);
  if (cloudAvailable && online) {
    queueCloudSync(record);
  }
  return record;
}

export function updateHandoffRecord(record: HandoffRecord) {
  if (!canUseStorage()) throw new Error("この環境では保存できません。");
  assertEditLockOwner(getHandoffRecordById(record.id), getCurrentUser());
  const records = getHandoffRecords().map((item) => item.id === record.id ? record : item);
  saveRecords(records);
}

export function deleteHandoffRecord(id: string) {
  if (!canUseStorage()) throw new Error("この環境では削除できません。");
  const records = getHandoffRecords().filter((record) => record.id !== id);
  saveRecords(records);
  if (isCloudSaveAvailable() && getNetworkStatus() === "online") {
    void deleteHandoffRecordFromCloud(id).catch((error) => {
      console.error("[Firestore sync] deleteDoc failed.", { recordId: id, error });
    });
  }
}

export function getPendingOfflineRecords() {
  return getHandoffRecords().filter((record) => record.syncStatus === "offline_pending" || record.syncStatus === "sync_failed" || record.syncStatus === "syncing");
}

export function markRecordSynced(recordId: string) {
  if (!canUseStorage()) return;
  const now = new Date().toISOString();
  const records = getHandoffRecords().map((record) => record.id === recordId
    ? { ...record, syncStatus: "synced" as HandoffSyncStatus, lastSyncedAt: now, syncError: "" }
    : record);
  saveRecords(records);
}

export function markRecordSyncFailed(recordId: string, message: string) {
  if (!canUseStorage()) return;
  const records = getHandoffRecords().map((record) => record.id === recordId
    ? { ...record, syncStatus: "sync_failed" as HandoffSyncStatus, syncError: message }
    : record);
  saveRecords(records);
}

export function markRecordSyncPending(recordId: string, message: string) {
  if (!canUseStorage()) return;
  const records = getHandoffRecords().map((record) => record.id === recordId
    ? { ...record, syncStatus: "offline_pending" as HandoffSyncStatus, syncError: message }
    : record);
  saveRecords(records);
}

export async function syncPendingRecords() {
  if (!canUseStorage()) return { ok: false, synced: 0, failed: 0, message: "この環境では同期できません。" };
  const pending = getPendingOfflineRecords();
  console.info("[Cloud sync] syncPendingRecords called.", {
    pendingCount: pending.length,
    networkStatus: getNetworkStatus(),
    cloudAvailable: isCloudSaveAvailable()
  });
  if (!pending.length) {
    console.info("[Cloud sync] no pending records.");
    return { ok: true, synced: 0, failed: 0, message: "同期対象はありません。" };
  }
  if (getNetworkStatus() === "offline") {
    console.warn("[Cloud sync] skipped because browser is offline.", { pendingCount: pending.length });
    return { ok: false, synced: 0, failed: pending.length, message: "オフラインのため、端末内に保存しています。" };
  }
  if (!isCloudSaveAvailable()) {
    const message = "Firebase設定が未登録です。端末内に保存したままです。";
    console.error("[Cloud sync] Firebase is not available.", { pendingCount: pending.length });
    const failedRecords = getHandoffRecords().map((record) => pending.some((item) => item.id === record.id)
      ? { ...record, syncStatus: "sync_failed" as HandoffSyncStatus, syncError: message }
      : record);
    saveRecords(failedRecords);
    return { ok: false, synced: 0, failed: pending.length, message };
  }

  const now = new Date().toISOString();
  try {
    const syncingRecords = getHandoffRecords().map((record) => pending.some((item) => item.id === record.id)
      ? { ...record, syncStatus: "syncing" as HandoffSyncStatus, syncError: "" }
      : record);
    saveRecords(syncingRecords);

    const results = await Promise.all(pending.map((record) => syncRecordWithPendingFallback(record)));
    console.info("[Cloud sync] syncPendingRecords results.", { results });
    const failedIds = new Set(results.filter((result) => result.result === "failed").map((result) => result.id));
    const pendingIds = new Set(results.filter((result) => result.result === "pending").map((result) => result.id));
    const syncedRecords = getHandoffRecords().map((record) => {
      if (!pending.some((item) => item.id === record.id)) return record;
      if (failedIds.has(record.id)) {
        const reason = results.find((result) => result.id === record.id)?.message || "クラウド同期に失敗しました。";
        return { ...record, syncStatus: "sync_failed" as HandoffSyncStatus, syncError: reason };
      }
      if (pendingIds.has(record.id)) {
        const reason = results.find((result) => result.id === record.id)?.message || cloudSyncPendingMessage;
        return { ...record, syncStatus: "offline_pending" as HandoffSyncStatus, syncError: reason };
      }
      return { ...record, syncStatus: "synced" as HandoffSyncStatus, lastSyncedAt: now, syncError: "" };
    });
    saveRecords(syncedRecords);
    if (failedIds.size) {
      const firstFailedReason = results.find((result) => result.result === "failed")?.message || "一部の同期に失敗しました。";
      return {
        ok: false,
        synced: pending.length - failedIds.size - pendingIds.size,
        failed: failedIds.size,
        message: firstFailedReason
      };
    }
    if (pendingIds.size) {
      return {
        ok: true,
        synced: pending.length - pendingIds.size,
        failed: 0,
        message: "クラウド同期待ちです。端末保存済みです。"
      };
    }
    return { ok: true, synced: pending.length, failed: 0, message: "クラウド同期完了" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "同期に失敗しました。";
    console.error("[Cloud sync] syncPendingRecords failed.", { message, error });
    const failedRecords = getHandoffRecords().map((record) => pending.some((item) => item.id === record.id)
      ? { ...record, syncStatus: "sync_failed" as HandoffSyncStatus, syncError: message }
      : record);
    saveRecords(failedRecords);
    return { ok: false, synced: 0, failed: pending.length, message };
  }
}

export function saveHandoffProgress(data: HandoffData, options: SaveHandoffRecordOptions) {
  return saveHandoffRecord(data, options);
}

export function updateHandoffStatus(record: HandoffRecord, status: HandoffRecordStatus) {
  return saveHandoffRecord(record.data, { id: record.id, status, pdfGenerated: record.pdf.generated });
}

export async function refreshHandoffRecordsFromCloud() {
  if (!canUseStorage() || !isCloudSaveAvailable() || getNetworkStatus() === "offline") return getHandoffRecords();
  const cloudRecords = await getCloudHandoffRecords();
  return mergeCloudRecordsIntoLocal(cloudRecords);
}

export function subscribeHandoffRecords(callback: (records: HandoffRecord[]) => void, intervalMs = 5000) {
  if (!canUseStorage()) return () => {};
  const emit = () => callback(getHandoffRecords());
  const refreshCloud = () => {
    void refreshHandoffRecordsFromCloud()
      .then((records) => callback(records))
      .catch((error) => {
        console.error("[Firestore sync] refresh cloud records failed.", error);
        emit();
      });
  };
  emit();
  refreshCloud();
  let unsubscribeCloud: (() => void) | null = null;
  let cancelled = false;
  void subscribeCloudHandoffRecords(
    (cloudRecords) => {
      if (cancelled) return;
      callback(mergeCloudRecordsIntoLocal(cloudRecords));
    },
    (message) => {
      console.error("[Firestore sync] realtime listener failed.", { message });
      emit();
    }
  ).then((unsubscribe) => {
    if (cancelled) {
      unsubscribe?.();
      return;
    }
    unsubscribeCloud = unsubscribe;
  });
  const timer = window.setInterval(emit, intervalMs);
  window.addEventListener(recordsUpdatedEventName, emit);
  window.addEventListener("storage", emit);
  window.addEventListener("online", refreshCloud);
  return () => {
    cancelled = true;
    window.clearInterval(timer);
    unsubscribeCloud?.();
    window.removeEventListener(recordsUpdatedEventName, emit);
    window.removeEventListener("storage", emit);
    window.removeEventListener("online", refreshCloud);
  };
}

export function exportHandoffRecordJson(record: HandoffRecord) {
  const stamp = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  downloadJsonFile(
    record,
    `業務引継書データ_${sanitizeFileName(record.vendorName)}_${sanitizeFileName(record.deceasedName || "未入力")}_${stamp}.json`
  );
}

export function openHandoffForEditing(record: HandoffRecord, step?: number) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(editingDraftKey, JSON.stringify(record.data));
  window.localStorage.setItem(editingRecordIdKey, record.id);
  if (typeof step === "number") {
    window.localStorage.setItem(editingStepKey, String(step));
  }
}
