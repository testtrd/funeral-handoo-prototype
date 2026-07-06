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

const masterStorageKey = "funeral-handoff-master-data-v1";

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
  vendorId: string;
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
  updatedAt: string;
};

export type ExtraQuestion = {
  id: string;
  vendorId: string;
  label: string;
  description: string;
  inputType: "text" | "textarea" | "radio" | "checkbox" | "date" | "time" | "number";
  options: string[];
  required: boolean;
  showOnConfirm: boolean;
  showOnVendorPdf: boolean;
  showOnInternalPdf: boolean;
  enabled: boolean;
  sortOrder: number;
};

export type MasterData = {
  branches: ManagedBranch[];
  vendors: ManagedVendor[];
  vendorRules: VendorRule[];
  extraQuestions: ExtraQuestion[];
};

function canUseStorage() {
  return typeof window !== "undefined";
}

function nowIso() {
  return new Date().toISOString();
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
    vendorId: vendor.id,
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
      label: externalInquiryQuestion,
      description: "",
      inputType: "radio",
      options: vendor.externalInquiryResponseOptions,
      required: true,
      showOnConfirm: true,
      showOnVendorPdf: true,
      showOnInternalPdf: true,
      enabled: true,
      sortOrder: 10 + index
    }));
  return { branches, vendors, vendorRules, extraQuestions };
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
      externalInquiryAnswerOptions: rule.vendorId === "ja_yasuragi_center"
        ? (rule.externalInquiryAnswerOptions || []).map(normalizeYasuragiOption)
        : rule.externalInquiryAnswerOptions,
      unionMemberTypeOptions: rule.showUnionMemberType
        ? Array.from(new Set([...(rule.unionMemberTypeOptions || []), "非組合員"]))
        : rule.unionMemberTypeOptions,
      handoffNoteOptions: normalizeHandoffNoteOptions(rule.handoffNoteOptions)
    })),
    extraQuestions: (data.extraQuestions || base.extraQuestions).map((question) => question.vendorId === "ja_yasuragi_center"
      ? { ...question, options: question.options.map(normalizeYasuragiOption) }
      : question)
  };
}

export function getMasterData(): MasterData {
  if (!canUseStorage()) return buildDefaultMasterData();
  try {
    const raw = window.localStorage.getItem(masterStorageKey);
    return raw ? normalizeMasterData(JSON.parse(raw) as Partial<MasterData>) : buildDefaultMasterData();
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

export function getVendorRule(vendorId: string) {
  const data = getMasterData();
  const fallback = defaultVendors[vendorId] || { ...defaultVendors.famille, id: vendorId, name: vendorId, funeralCompanyContact: "" };
  return data.vendorRules.find((rule) => rule.vendorId === vendorId) || defaultRuleForVendor(fallback);
}

export function getExtraQuestions(vendorId?: string) {
  const questions = getMasterData().extraQuestions.filter((question) => question.enabled);
  return (vendorId ? questions.filter((question) => question.vendorId === vendorId) : questions)
    .sort((left, right) => left.sortOrder - right.sortOrder);
}

export function getVendorMap(): Record<string, VendorConfig> {
  const data = getMasterData();
  const rules = new Map(data.vendorRules.map((rule) => [rule.vendorId, rule]));
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
  const item = { ...branch, updatedAt: now, createdAt: branch.createdAt || now };
  data.branches = data.branches.some((value) => value.id === item.id)
    ? data.branches.map((value) => value.id === item.id ? item : value)
    : [...data.branches, item];
  saveMasterData(data);
}

export function deleteBranch(id: string) {
  const data = getMasterData();
  data.branches = data.branches.filter((branch) => branch.id !== id);
  saveMasterData(data);
}

export function saveVendor(vendor: ManagedVendor) {
  const data = getMasterData();
  const now = nowIso();
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
  saveMasterData(data);
}

export function deleteVendor(id: string) {
  const data = getMasterData();
  data.vendors = data.vendors.filter((vendor) => vendor.id !== id);
  data.vendorRules = data.vendorRules.filter((rule) => rule.vendorId !== id);
  data.extraQuestions = data.extraQuestions.filter((question) => question.vendorId !== id);
  data.branches = data.branches.map((branch) => ({ ...branch, vendorIds: branch.vendorIds.filter((vendorId) => vendorId !== id) }));
  saveMasterData(data);
}

export function saveVendorRule(rule: VendorRule) {
  const data = getMasterData();
  const item = { ...rule, updatedAt: nowIso() };
  data.vendorRules = data.vendorRules.some((value) => value.vendorId === item.vendorId)
    ? data.vendorRules.map((value) => value.vendorId === item.vendorId ? item : value)
    : [...data.vendorRules, item];
  saveMasterData(data);
}

export function saveExtraQuestion(question: ExtraQuestion) {
  const data = getMasterData();
  data.extraQuestions = data.extraQuestions.some((value) => value.id === question.id)
    ? data.extraQuestions.map((value) => value.id === question.id ? question : value)
    : [...data.extraQuestions, question];
  saveMasterData(data);
}

export function deleteExtraQuestion(id: string) {
  const data = getMasterData();
  data.extraQuestions = data.extraQuestions.filter((question) => question.id !== id);
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
  anchor.download = `業務引継書マスター_${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function importMasterDataJsonText(text: string) {
  saveMasterData(normalizeMasterData(JSON.parse(text) as Partial<MasterData>));
}

export { splitOptions };
