import {
  branches as defaultBranches,
  defaultVendorHandoffNoteOptions,
  excludedVendorHandoffNoteOptions,
  externalInquiryQuestion,
  funeralScaleQuestion,
  membershipStatusQuestion,
  unionMemberTypeQuestion,
  vendors as defaultVendors,
  type VendorConfig
} from "@/lib/master";
import { getCurrentUser } from "@/lib/authService";
import { hasJsonContent, safeJsonParse } from "@/lib/safeJson";

const masterStorageKey = "funeral-handoff-master-data-v1";

export type MasterScope = "global" | "branch";

export type ManagedBranch = {
  id: string;
  name: string;
  enabled: boolean;
  vendorIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type ManagedVendor = {
  id: string;
  name: string;
  funeralCompanyContact: string;
  branchIds: string[];
  pdfTemplate: string;
  outputFolder: string;
  sendTo: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type VendorRule = {
  id?: string;
  vendorId: string;
  scope: MasterScope;
  branchId: string;
  cremationReservationRequired: boolean;
  blockCompletionIfCremationNotReserved: boolean;
  showMournerBirthDate: boolean;
  requireMournerBirthDate: boolean;
  showPreferredContact: boolean;
  showFuneralScale: boolean;
  funeralScaleOptions: string[];
  showMembership: boolean;
  membershipOptions: string[];
  showUnionMemberType: boolean;
  unionMemberTypeOptions: string[];
  showExternalInquiryAnswer: boolean;
  externalInquiryAnswerOptions: string[];
  showPortraitPhoto: boolean;
  portraitPhotoOptions: string[];
  handoffNoteOptions: string[];
  showPacemaker: boolean;
  requirePacemaker: boolean;
  showCremationPreCheck: boolean;
  enabled: boolean;
  isActive?: boolean;
  disabledAt?: string;
  disabledBy?: string;
  updatedBy?: string;
  updatedAt: string;
};

export type ExtraQuestion = {
  id: string;
  vendorId: string;
  scope: MasterScope;
  branchId: string;
  label: string;
  description: string;
  inputType: "text" | "textarea" | "radio" | "checkbox" | "date" | "time" | "number";
  options: string[];
  required: boolean;
  showOnConfirm: boolean;
  showOnVendorPdf: boolean;
  showOnInternalPdf: boolean;
  enabled: boolean;
  isActive?: boolean;
  disabledAt?: string;
  disabledBy?: string;
  updatedBy?: string;
  sortOrder: number;
};

export type MasterChangeLog = {
  id: string;
  targetType: "case" | "vendorRule" | "extraQuestion" | "vendor" | "branch" | "user" | "systemSetting" | "caseStatus" | "postWork" | "handoffNote";
  targetId: string;
  caseId?: string;
  fieldName: string;
  beforeValue: unknown;
  afterValue: unknown;
  operation: "create" | "update" | "disable" | "restore" | "delete";
  changedByUserId: string;
  changedByName: string;
  changedByRole: string;
  changedByBranchId: string;
  changedAt: string;
  reason?: string;
};

export type MasterData = {
  branches: ManagedBranch[];
  vendors: ManagedVendor[];
  vendorRules: VendorRule[];
  extraQuestions: ExtraQuestion[];
  changeLogs: MasterChangeLog[];
};

function canUseStorage() {
  return typeof window !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
}

function changeLogId() {
  return `change_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function currentUserMeta() {
  const user = getCurrentUser();
  return {
    changedByUserId: user?.userId || "",
    changedByName: user?.name || "",
    changedByRole: user?.role || "",
    changedByBranchId: user?.branchId || user?.branchIds?.[0] || ""
  };
}

function appendChangeLog(
  data: MasterData,
  entry: Omit<MasterChangeLog, "id" | "changedAt" | "changedByUserId" | "changedByName" | "changedByRole" | "changedByBranchId">
) {
  data.changeLogs = [
    ...(data.changeLogs || []),
    {
      id: changeLogId(),
      changedAt: nowIso(),
      ...currentUserMeta(),
      ...entry
    }
  ].slice(-500);
}

function normalizeBranchIdSeed(name: string) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 32);
}

function createBranchId(name: string, existingIds: string[]) {
  const existing = new Set(existingIds);
  const base = normalizeBranchIdSeed(name) || `branch_${Date.now().toString(36)}`;
  let candidate = base;
  let index = 2;
  while (existing.has(candidate)) {
    candidate = `${base}_${index}`;
    index += 1;
  }
  return candidate;
}

function splitOptions(value: string) {
  return value.split(/\r?\n|,/).map((item) => item.trim()).filter(Boolean);
}

function normalizeHandoffNoteOptions(options: string[] | undefined) {
  const excluded = new Set(excludedVendorHandoffNoteOptions);
  const normalized = (options?.length ? options : defaultVendorHandoffNoteOptions)
    .map((item) => item.trim())
    .filter((item) => item && !excluded.has(item));
  return normalized.length ? Array.from(new Set(normalized)) : defaultVendorHandoffNoteOptions;
}

export function optionsToText(options: string[]) {
  return options.join("\n");
}

function defaultRuleForVendor(vendor: VendorConfig): VendorRule {
  return {
    id: `${vendor.id}_global`,
    vendorId: vendor.id,
    scope: "global",
    branchId: "",
    cremationReservationRequired: vendor.requiresCremationReservation,
    blockCompletionIfCremationNotReserved: vendor.requiresCremationReservation,
    showMournerBirthDate: vendor.showChiefMournerBirthDate,
    requireMournerBirthDate: vendor.requiresChiefMournerBirthDate,
    showPreferredContact: vendor.showPreferredContact,
    showFuneralScale: vendor.showFuneralScale,
    funeralScaleOptions: ["一般葬", "家族葬", "その他"],
    showMembership: vendor.showMembershipStatus,
    membershipOptions: ["会員", "非会員", "不明"],
    showUnionMemberType: vendor.showUnionMemberType,
    unionMemberTypeOptions: ["正組合員", "准組合員", "非組合員"],
    showExternalInquiryAnswer: vendor.externalInquiryResponseOptions.length > 0,
    externalInquiryAnswerOptions: vendor.externalInquiryResponseOptions,
    showPortraitPhoto: true,
    portraitPhotoOptions: ["有", "未定", "無"],
    handoffNoteOptions: normalizeHandoffNoteOptions(defaultVendorHandoffNoteOptions),
    showPacemaker: true,
    requirePacemaker: true,
    showCremationPreCheck: true,
    enabled: true,
    isActive: true,
    updatedAt: nowIso()
  };
}

export function buildDefaultMasterData(): MasterData {
  const createdAt = nowIso();
  const branches: ManagedBranch[] = defaultBranches.map((branch) => ({
    id: branch.id,
    name: branch.name,
    enabled: true,
    vendorIds: [...branch.vendorIds],
    createdAt,
    updatedAt: createdAt
  }));
  const vendors: ManagedVendor[] = Object.values(defaultVendors).map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    funeralCompanyContact: vendor.funeralCompanyContact,
    branchIds: branches.filter((branch) => branch.vendorIds.includes(vendor.id)).map((branch) => branch.id),
    pdfTemplate: `${vendor.id}_default`,
    outputFolder: vendor.name,
    sendTo: "",
    enabled: true,
    createdAt,
    updatedAt: createdAt
  }));
  const vendorRules = Object.values(defaultVendors).map(defaultRuleForVendor);
  const extraQuestions: ExtraQuestion[] = Object.values(defaultVendors)
    .filter((vendor) => vendor.externalInquiryResponseOptions.length > 0)
    .map((vendor, index) => ({
      id: `${vendor.id}_external_inquiry`,
      vendorId: vendor.id,
      scope: "global",
      branchId: "",
      label: externalInquiryQuestion,
      description: "",
      inputType: "radio",
      options: vendor.externalInquiryResponseOptions,
      required: true,
      showOnConfirm: true,
      showOnVendorPdf: true,
      showOnInternalPdf: true,
      enabled: true,
      isActive: true,
      sortOrder: 10 + index
    }));
  return { branches, vendors, vendorRules, extraQuestions, changeLogs: [] };
}

function normalizeMasterData(data: Partial<MasterData>): MasterData {
  const base = buildDefaultMasterData();
  const vendorRules = data.vendorRules?.length ? data.vendorRules : base.vendorRules;
  const normalizeYasuragiOption = (option: string) => option === "①全て同意する" ? "①全て同意する(一般葬)" : option;
  return {
    branches: data.branches?.length ? data.branches : base.branches,
    vendors: data.vendors?.length ? data.vendors : base.vendors,
    vendorRules: vendorRules.map((rule) => ({
      ...rule,
      id: rule.id || `${rule.vendorId}_${rule.scope || "global"}_${rule.branchId || "all"}`,
      scope: rule.scope || "global",
      branchId: rule.branchId || "",
      enabled: rule.enabled !== false && rule.isActive !== false,
      isActive: rule.isActive !== false && rule.enabled !== false,
      externalInquiryAnswerOptions: rule.vendorId === "ja_yasuragi_center"
        ? (rule.externalInquiryAnswerOptions || []).map(normalizeYasuragiOption)
        : rule.externalInquiryAnswerOptions,
      unionMemberTypeOptions: rule.showUnionMemberType
        ? Array.from(new Set([...(rule.unionMemberTypeOptions || []), "非組合員"]))
        : rule.unionMemberTypeOptions,
      handoffNoteOptions: normalizeHandoffNoteOptions(rule.handoffNoteOptions)
    })),
    extraQuestions: (data.extraQuestions || base.extraQuestions).map((question) => {
      const normalized = {
        ...question,
        scope: question.scope || "global" as MasterScope,
        branchId: question.branchId || "",
        enabled: question.enabled !== false && question.isActive !== false,
        isActive: question.isActive !== false && question.enabled !== false
      };
      return normalized.vendorId === "ja_yasuragi_center"
        ? { ...normalized, options: normalized.options.map(normalizeYasuragiOption) }
        : normalized;
    }),
    changeLogs: data.changeLogs || []
  };
}

export function getMasterData(): MasterData {
  if (!canUseStorage()) return buildDefaultMasterData();
  try {
    const raw = window.localStorage.getItem(masterStorageKey);
    if (!hasJsonContent(raw)) return buildDefaultMasterData();
    return normalizeMasterData(safeJsonParse<Partial<MasterData>>(raw, {
      fallback: buildDefaultMasterData(),
      label: "masterDataService.getMasterData localStorage master data"
    }));
  } catch {
    return buildDefaultMasterData();
  }
}

export function saveMasterData(data: MasterData) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(masterStorageKey, JSON.stringify(data));
}

export function getBranches() {
  return getMasterData().branches.filter((branch) => branch.enabled);
}

export function getAllBranches() {
  return getMasterData().branches;
}

export function getVendors() {
  return getMasterData().vendors.filter((vendor) => vendor.enabled);
}

export function getAllVendors() {
  return getMasterData().vendors;
}

export function getVendorRules() {
  return getMasterData().vendorRules;
}

export function getVendorRule(vendorId: string, branchId = "") {
  const data = getMasterData();
  const fallback = defaultVendors[vendorId] || { ...defaultVendors.famille, id: vendorId, name: vendorId, funeralCompanyContact: "" };
  const activeRules = data.vendorRules.filter((rule) => rule.vendorId === vendorId && rule.enabled !== false && rule.isActive !== false);
  return activeRules.find((rule) => rule.scope === "branch" && rule.branchId === branchId)
    || activeRules.find((rule) => (rule.scope || "global") === "global")
    || defaultRuleForVendor(fallback);
}

export function getExtraQuestions(vendorId?: string, branchId = "") {
  const questions = getMasterData().extraQuestions.filter((question) => question.enabled && question.isActive !== false);
  return (vendorId ? questions.filter((question) => question.vendorId === vendorId) : questions)
    .filter((question) => (question.scope || "global") === "global" || question.branchId === branchId)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getVendorMap(): Record<string, VendorConfig> {
  const data = getMasterData();
  const rules = new Map(data.vendorRules.filter((rule) => (rule.scope || "global") === "global" && rule.enabled !== false && rule.isActive !== false).map((rule) => [rule.vendorId, rule]));
  return Object.fromEntries(data.vendors.filter((vendor) => vendor.enabled).map((vendor) => {
    const rule = rules.get(vendor.id);
    const fallback = defaultVendors[vendor.id];
    return [vendor.id, {
      id: vendor.id,
      name: vendor.name,
      funeralCompanyContact: vendor.funeralCompanyContact,
      showFuneralScale: rule?.showFuneralScale ?? fallback?.showFuneralScale ?? false,
      showMembershipStatus: rule?.showMembership ?? fallback?.showMembershipStatus ?? false,
      showUnionMemberType: rule?.showUnionMemberType ?? fallback?.showUnionMemberType ?? false,
      showPreferredContact: rule?.showPreferredContact ?? fallback?.showPreferredContact ?? true,
      requiresCremationReservation: rule?.cremationReservationRequired ?? fallback?.requiresCremationReservation ?? false,
      showChiefMournerBirthDate: rule?.showMournerBirthDate ?? fallback?.showChiefMournerBirthDate ?? false,
      requiresChiefMournerBirthDate: rule?.requireMournerBirthDate ?? fallback?.requiresChiefMournerBirthDate ?? false,
      externalInquiryResponseOptions: rule?.showExternalInquiryAnswer ? rule.externalInquiryAnswerOptions : [],
      vendorHandoffNoteOptions: normalizeHandoffNoteOptions(rule?.handoffNoteOptions || fallback?.vendorHandoffNoteOptions),
      notices: fallback?.notices || []
    } satisfies VendorConfig];
  }));
}

export function saveBranch(branch: ManagedBranch) {
  const data = getMasterData();
  const now = nowIso();
  const id = branch.id || createBranchId(branch.name, data.branches.map((item) => item.id));
  const existing = data.branches.find((value) => value.id === id);
  const item = { ...branch, id, updatedAt: now, createdAt: branch.createdAt || now };
  data.branches = data.branches.some((value) => value.id === item.id)
    ? data.branches.map((value) => value.id === item.id ? item : value)
    : [...data.branches, item];
  appendChangeLog(data, { targetType: "branch", targetId: item.id, fieldName: "branch", beforeValue: existing || null, afterValue: item, operation: existing ? "update" : "create" });
  saveMasterData(data);
}

export function deleteBranch(id: string) {
  const data = getMasterData();
  const existing = data.branches.find((branch) => branch.id === id);
  data.branches = data.branches.map((branch) => branch.id === id ? { ...branch, enabled: false, updatedAt: nowIso() } : branch);
  appendChangeLog(data, { targetType: "branch", targetId: id, fieldName: "enabled", beforeValue: existing?.enabled, afterValue: false, operation: "disable" });
  saveMasterData(data);
}

export function saveVendor(vendor: ManagedVendor) {
  const data = getMasterData();
  const now = nowIso();
  const existing = data.vendors.find((value) => value.id === vendor.id);
  const item = { ...vendor, updatedAt: now, createdAt: vendor.createdAt || now };
  data.vendors = data.vendors.some((value) => value.id === item.id)
    ? data.vendors.map((value) => value.id === item.id ? item : value)
    : [...data.vendors, item];
  data.branches = data.branches.map((branch) => ({
    ...branch,
    vendorIds: item.branchIds.includes(branch.id)
      ? Array.from(new Set([...branch.vendorIds, item.id]))
      : branch.vendorIds.filter((vendorId) => vendorId !== item.id)
  }));
  if (!data.vendorRules.some((rule) => rule.vendorId === item.id)) {
    data.vendorRules.push(defaultRuleForVendor({ ...defaultVendors.famille, id: item.id, name: item.name, funeralCompanyContact: item.funeralCompanyContact }));
  }
  appendChangeLog(data, { targetType: "vendor", targetId: item.id, fieldName: "vendor", beforeValue: existing || null, afterValue: item, operation: existing ? "update" : "create" });
  saveMasterData(data);
}

export function deleteVendor(id: string) {
  const data = getMasterData();
  const existing = data.vendors.find((vendor) => vendor.id === id);
  data.vendors = data.vendors.map((vendor) => vendor.id === id ? { ...vendor, enabled: false, updatedAt: nowIso() } : vendor);
  data.vendorRules = data.vendorRules.map((rule) => rule.vendorId === id ? { ...rule, enabled: false, isActive: false, disabledAt: nowIso(), disabledBy: currentUserMeta().changedByUserId } : rule);
  data.extraQuestions = data.extraQuestions.map((question) => question.vendorId === id ? { ...question, enabled: false, isActive: false, disabledAt: nowIso(), disabledBy: currentUserMeta().changedByUserId } : question);
  appendChangeLog(data, { targetType: "vendor", targetId: id, fieldName: "enabled", beforeValue: existing?.enabled, afterValue: false, operation: "disable" });
  saveMasterData(data);
}

export function saveVendorRule(rule: VendorRule) {
  const data = getMasterData();
  const scope = rule.scope || "global";
  const branchId = scope === "branch" ? rule.branchId : "";
  const id = rule.id || `${rule.vendorId}_${scope}_${branchId || "all"}`;
  const existing = data.vendorRules.find((value) => (value.id || `${value.vendorId}_${value.scope || "global"}_${value.branchId || "all"}`) === id);
  const item = { ...rule, id, scope, branchId, enabled: rule.enabled !== false, isActive: rule.isActive !== false && rule.enabled !== false, updatedAt: nowIso(), updatedBy: currentUserMeta().changedByUserId };
  data.vendorRules = data.vendorRules.some((value) => (value.id || `${value.vendorId}_${value.scope || "global"}_${value.branchId || "all"}`) === item.id)
    ? data.vendorRules.map((value) => (value.id || `${value.vendorId}_${value.scope || "global"}_${value.branchId || "all"}`) === item.id ? item : value)
    : [...data.vendorRules, item];
  appendChangeLog(data, { targetType: "vendorRule", targetId: item.id || item.vendorId, fieldName: "vendorRule", beforeValue: existing || null, afterValue: item, operation: existing ? "update" : "create" });
  saveMasterData(data);
}

export function saveExtraQuestion(question: ExtraQuestion) {
  const data = getMasterData();
  const existing = data.extraQuestions.find((value) => value.id === question.id);
  const item = { ...question, scope: question.scope || "global" as MasterScope, branchId: question.scope === "branch" ? question.branchId : "", enabled: question.enabled !== false, isActive: question.isActive !== false && question.enabled !== false, updatedBy: currentUserMeta().changedByUserId };
  data.extraQuestions = data.extraQuestions.some((value) => value.id === item.id)
    ? data.extraQuestions.map((value) => value.id === item.id ? item : value)
    : [...data.extraQuestions, item];
  appendChangeLog(data, { targetType: "extraQuestion", targetId: item.id, fieldName: "extraQuestion", beforeValue: existing || null, afterValue: item, operation: existing ? "update" : "create" });
  saveMasterData(data);
}

export function deleteExtraQuestion(id: string) {
  const data = getMasterData();
  const existing = data.extraQuestions.find((question) => question.id === id);
  data.extraQuestions = data.extraQuestions.map((question) => question.id === id ? { ...question, enabled: false, isActive: false, disabledAt: nowIso(), disabledBy: currentUserMeta().changedByUserId } : question);
  appendChangeLog(data, { targetType: "extraQuestion", targetId: id, fieldName: "enabled", beforeValue: existing?.enabled, afterValue: false, operation: "disable" });
  saveMasterData(data);
}

export function resetMasterDataToDefault() {
  saveMasterData(buildDefaultMasterData());
}

export function exportMasterDataJson() {
  const blob = new Blob([JSON.stringify(getMasterData(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `業務引継書設定_${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function importMasterDataJsonText(text: string) {
  const imported = safeJsonParse<Partial<MasterData> | null>(text, {
    fallback: null,
    label: "masterDataService.importMasterDataJsonText"
  });
  if (!imported) {
    throw new Error("JSONファイルを読み込めませんでした。内容を確認してください。");
  }
  saveMasterData(normalizeMasterData(imported));
}

export { splitOptions };
