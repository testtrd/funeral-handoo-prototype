"use client";

import { ArrowLeft, FileDown, FileJson, Mail, Pencil, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthStatus } from "@/components/AuthGate";
import { InternalStorageReport, PaperReport, RelativeCopyReport } from "@/components/HandoffApp";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { canDeleteCase, canEditCase, canManageMasters, canViewAllCases, canViewCase } from "@/lib/accessControl";
import { getCurrentUser, type AuthSession } from "@/lib/authService";
import { createElementPdfBlob, downloadElementAsPdf, sanitizeFileName } from "@/lib/downloadService";
import { familyCopyDeliveryText } from "@/lib/familyCopyDeliveryService";
import {
  deleteHandoffRecord,
  acquireHandoffEditLock,
  editLockDisplay,
  exportHandoffRecordJson,
  getHandoffRecords,
  getActiveEditLock,
  nextActionForRecord,
  openHandoffForEditing,
  progressPercentForStatus,
  saveHandoffRecord,
  subscribeHandoffRecords,
  syncStatusLabel,
  isRecordEditedByOther,
  type HandoffRecord,
  type HandoffRecordStatus
} from "@/lib/handoffStorage";
import { defaultVendorHandoffNoteOptions } from "@/lib/master";
import { getBranches, getVendorMap } from "@/lib/masterDataService";
import type { HandoffData } from "@/types/form";

const statuses: Array<"" | HandoffRecordStatus> = ["", "入力中", "現場入力完了", "業務終了後入力済み", "控え作成済み", "送信済み", "完了"];
const statusOrder: HandoffRecordStatus[] = ["入力中", "現場入力完了", "業務終了後入力済み", "控え作成済み", "送信済み", "完了"];

function advanceStatus(current: HandoffRecordStatus, next: HandoffRecordStatus) {
  return statusOrder.indexOf(next) > statusOrder.indexOf(current) ? next : current;
}

function statusDisplay(status: HandoffRecordStatus) {
  const mark: Record<HandoffRecordStatus, string> = {
    入力中: "🟡",
    現場入力完了: "🟢",
    業務終了後入力済み: "🟣",
    控え作成済み: "🔵",
    送信済み: "✅",
    完了: "✅"
  };
  return `${mark[status]} ${status}`;
}

function progressPercent(record: HandoffRecord) {
  return progressPercentForStatus(record.status, record.handoffProgress);
}

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function formatFlexibleDateTime(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function updatedByName(record: HandoffRecord) {
  return record.updatedBy?.name || record.createdBy?.name || "-";
}

function renderEditLock(record: HandoffRecord) {
  const lock = editLockDisplay(record);
  return (
    <span className={lock.locked ? "edit-lock-chip active" : "edit-lock-chip"}>
      <strong>{lock.label}</strong>
      {lock.lastActiveAt ? <small>最終操作 {formatDateTime(lock.lastActiveAt)}</small> : null}
    </span>
  );
}

function isRelatedToUser(record: HandoffRecord, userId: string) {
  return record.createdBy?.userId === userId || record.assignedDriver?.userId === userId;
}

function userBranchIds(user: ReturnType<typeof getCurrentUser>) {
  if (!user) return [];
  if (Array.isArray(user.branchIds) && user.branchIds.length) return user.branchIds.filter(Boolean);
  return user.branchId ? [user.branchId] : [];
}

function getVendorHandoffNoteOptions(data: HandoffData) {
  const vendor = getVendorMap()[data.vendorId];
  const options = vendor?.vendorHandoffNoteOptions?.length ? vendor.vendorHandoffNoteOptions : defaultVendorHandoffNoteOptions;
  return Array.from(new Set(["お寺様紹介希望", ...options]));
}

function suggestedHandoffNoteItems(data: HandoffData) {
  const suggestions = [
    data.schedule.cremationReservationStatus === "済" ? "火葬予約済み" : "",
    data.religion.contactStatus === "連絡済み" ? "宗教者へ連絡済み" : "",
    data.religion.contactStatus === "連絡未" ? "宗教者へ未連絡" : "",
    data.religion.introductionWanted === "希望する" ? "お寺様紹介希望" : "",
    data.deceased.pacemaker === "有" ? "ペースメーカーあり" : "",
    data.transport.destinationType === "自宅" ? "自宅安置" : "",
    data.transport.destinationType === "ホール" ? "ホール安置" : ""
  ].filter(Boolean);
  return Array.from(new Set(suggestions));
}

export default function AdminDashboard() {
  const [records, setRecords] = useState<HandoffRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedRecordIds, setSelectedRecordIds] = useState<string[]>([]);
  const [filters, setFilters] = useState({ branch: "", vendor: "", date: "", keyword: "", reservation: "", status: "" });
  const [role, setRole] = useState("");
  const [currentUser, setCurrentUser] = useState<AuthSession | null>(null);
  const [printReport, setPrintReport] = useState<"vendor" | "internal">("internal");
  const [printJobs, setPrintJobs] = useState<Array<{ record: HandoffRecord; type: "vendor" | "internal" }>>([]);
  const [pdfJob, setPdfJob] = useState<{ record: HandoffRecord; type: "relative" | "vendor" | "internal" } | null>(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [familyCopyTestMethod, setFamilyCopyTestMethod] = useState<"email" | "sms">("email");
  const [sendingFamilyCopyTest, setSendingFamilyCopyTest] = useState(false);
  const [familyCopyTestStatus, setFamilyCopyTestStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [handoffNotesDraft, setHandoffNotesDraft] = useState<HandoffData["handoffNotes"]>({
    selectedItems: [],
    freeText: "",
    templeIntroductionWanted: "",
    morningContactToRepresentative: false
  });
  const [postWorkDraft, setPostWorkDraft] = useState<HandoffData["postWork"] | null>(null);
  const [postWorkDirty, setPostWorkDirty] = useState(false);
  const relativePdfRef = useRef<HTMLDivElement>(null);
  const vendorPdfRef = useRef<HTMLDivElement>(null);
  const internalPdfRef = useRef<HTMLDivElement>(null);
  const branches = getBranches();
  const vendors = getVendorMap();

  function loadRecords() {
    const current = getCurrentUser();
    const allRecords = getHandoffRecords();
    setRole(current?.role || "");
    setCurrentUser(current);
    if (!current) {
      setRecords([]);
      return;
    }
    if (canViewAllCases(current)) {
      setRecords(allRecords);
      return;
    }
    setRecords(allRecords.filter((record) => canViewCase(current, record) || isRelatedToUser(record, current.userId)));
  }

  useEffect(() => {
    return subscribeHandoffRecords(() => loadRecords(), 5000);
  }, []);

  useEffect(() => {
    const clearPrintJobs = () => setPrintJobs([]);
    window.addEventListener("afterprint", clearPrintJobs);
    return () => window.removeEventListener("afterprint", clearPrintJobs);
  }, []);

  const selected = records.find((record) => record.id === selectedId);
  const isMaster = role === "master";
  const isAdmin = isMaster;
  const canViewAll = canViewAllCases(currentUser);
  const canOpenMasterAdmin = canManageMasters(currentUser);
  const selectedCanEdit = selected ? canEditCase(currentUser, selected) : false;

  useEffect(() => {
    if (!selected) return;
    setFamilyCopyTestMethod(selected.data.familyCopyDelivery.method === "sms" ? "sms" : "email");
    setFamilyCopyTestStatus(null);
    setHandoffNotesDraft({
      selectedItems: [...selected.data.handoffNotes.selectedItems],
      freeText: selected.data.handoffNotes.freeText,
      templeIntroductionWanted: selected.data.handoffNotes.templeIntroductionWanted,
      morningContactToRepresentative: selected.data.handoffNotes.morningContactToRepresentative
    });
    setPostWorkDraft(structuredClone(selected.data.postWork));
    setPostWorkDirty(false);
  }, [selected?.id]);
  const filteredRecords = useMemo(() => records.filter((record) => (
    (!filters.branch || record.branchId === filters.branch) &&
    (!filters.vendor || record.vendorId === filters.vendor) &&
    (!filters.date || record.createdAt.slice(0, 10) === filters.date) &&
    (!filters.keyword || [
      record.deceasedName,
      record.mournerName,
      record.assignedDriver?.name,
      record.assignedDriver?.userId,
      record.createdBy?.name,
      record.createdBy?.userId
    ].filter(Boolean).some((value) => value?.includes(filters.keyword))) &&
    (!filters.reservation || record.cremationReservationStatus === filters.reservation) &&
    (!filters.status || record.status === filters.status)
  )), [filters, records]);
  const selectableRecords = useMemo(() => filteredRecords.filter((record) => selectedRecordIds.includes(record.id)), [filteredRecords, selectedRecordIds]);
  const postWorkCompletionReady = Boolean(selected?.data.postWork.savedAt) && !postWorkDirty;

  function dateStamp() {
    return new Date().toISOString().slice(0, 10).replaceAll("-", "");
  }

  function nextStatusForPdf(record: HandoffRecord, type: "relative" | "vendor" | "internal"): HandoffRecordStatus {
    if (type === "relative") return record.status;
    return advanceStatus(record.status, "控え作成済み");
  }

  async function recreatePdf(record: HandoffRecord, type: "relative" | "vendor" | "internal") {
    try {
      if (type !== "relative" && !canEditCase(currentUser, record)) {
        alert("\u4ed6\u62e0\u70b9\u306e\u6848\u4ef6\u306e\u305f\u3081\u3001PDF\u4f5c\u6210\u72b6\u614b\u306e\u66f4\u65b0\u306f\u3067\u304d\u307e\u305b\u3093\u3002");
        return;
      }
      const now = new Date().toISOString();
      const fileName = type === "relative"
        ? `親族控え_${sanitizeFileName(record.deceasedName || "未入力")}_${dateStamp()}.pdf`
        : type === "vendor"
          ? `業者控え_業務引継書_${sanitizeFileName(record.vendorName)}_${sanitizeFileName(record.deceasedName || "未入力")}_${dateStamp()}.pdf`
          : `社内控え_業務引継書_${sanitizeFileName(record.vendorName)}_${sanitizeFileName(record.deceasedName || "未入力")}_${dateStamp()}.pdf`;
      const copyKey = type === "relative" ? "relativeCopy" : type === "vendor" ? "vendorCopy" : "internalCopy";
      const nextData = {
        ...record.data,
        [copyKey]: {
          ...record.data[copyKey],
          generated: true,
          generatedAt: now,
          fileName
        }
      };
      if (type !== "relative") setPrintReport(type);
      document.title = fileName.replace(/\.pdf$/i, "");
      const updated = saveHandoffRecord(nextData, { id: record.id, status: nextStatusForPdf(record, type), pdfGenerated: true });
      setPdfJob({ record: updated, type });
      await new Promise((resolve) => window.setTimeout(resolve, 0));
      const target = type === "relative" ? relativePdfRef.current : type === "vendor" ? vendorPdfRef.current : internalPdfRef.current;
      if (!target) throw new Error("PDF作成用の帳票を読み込めませんでした。");
      await downloadElementAsPdf(target, fileName);
      loadRecords();
      setSelectedId((current) => current === record.id ? updated.id : current);
    } catch (error) {
      alert(error instanceof Error ? error.message : "PDF作成に失敗しました。");
    } finally {
      setPdfJob(null);
    }
  }

  async function recreatePdfForSelected(type: "relative" | "vendor" | "internal") {
    if (!selectableRecords.length) {
      alert("操作する案件を選択してください。");
      return;
    }
    const targets = type === "relative" ? selectableRecords : selectableRecords.filter((record) => canEditCase(currentUser, record));
    if (!targets.length) {
      alert("\u7de8\u96c6\u3067\u304d\u308b\u6848\u4ef6\u304c\u9078\u629e\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002");
      return;
    }
    for (const record of targets) {
      await recreatePdf(record, type);
    }
  }

  async function shareVendorPdfForSelected() {
    if (!selectableRecords.length) {
      alert("操作する案件を選択してください。");
      return;
    }
    if (!("share" in navigator) || !("canShare" in navigator)) {
      alert("この端末では直接共有に対応していません。PDFを保存してからLINE WORKSのトークで共有してください。");
      return;
    }

    try {
      const files: File[] = [];
      const targets = selectableRecords.filter((record) => canEditCase(currentUser, record));
      if (!targets.length) {
        alert("\u7de8\u96c6\u3067\u304d\u308b\u6848\u4ef6\u304c\u9078\u629e\u3055\u308c\u3066\u3044\u307e\u305b\u3093\u3002");
        return;
      }
      for (const record of targets) {
        const fileName = `業者控え_業務引継書_${sanitizeFileName(record.vendorName)}_${sanitizeFileName(record.deceasedName || "未入力")}_${dateStamp()}.pdf`;
        document.title = fileName.replace(/\.pdf$/i, "");
        const updated = saveHandoffRecord(record.data, { id: record.id, status: nextStatusForPdf(record, "vendor"), pdfGenerated: true });
        setPdfJob({ record: updated, type: "vendor" });
        await new Promise((resolve) => window.setTimeout(resolve, 0));
        if (!vendorPdfRef.current) throw new Error("PDF共有用の帳票を読み込めませんでした。");
        const blob = await createElementPdfBlob(vendorPdfRef.current);
        files.push(new File([blob], fileName, { type: "application/pdf" }));
      }

      if (!navigator.canShare({ files })) {
        alert("この端末ではPDFファイルの直接共有に対応していません。PDFを保存してからLINE WORKSのトークで共有してください。");
        return;
      }
      await navigator.share({
        title: "業務引継書",
        text: "業務引継書PDFを共有します。",
        files
      });
      loadRecords();
    } catch (error) {
      alert(error instanceof Error ? error.message : "PDF共有に失敗しました。PDFを保存してからLINE WORKSで共有してください。");
    } finally {
      setPdfJob(null);
    }
  }

  function saveFamilyCopyTestResult(record: HandoffRecord, updates: {
    method: "email" | "sms";
    testSentAt: string;
    testSendStatus: "success" | "error" | "pending";
    testSendError: string;
  }) {
    const nextData = {
      ...record.data,
      familyCopyDelivery: {
        ...record.data.familyCopyDelivery,
        method: updates.method,
        testSentAt: updates.testSentAt,
        testSendStatus: updates.testSendStatus,
        testSendError: updates.testSendError
      }
    };
    const updated = saveHandoffRecord(nextData, { id: record.id, status: record.status, pdfGenerated: record.pdf.generated });
    loadRecords();
    setSelectedId(updated.id);
  }

  async function sendFamilyCopyTest(record: HandoffRecord) {
    setFamilyCopyTestStatus(null);
    const now = new Date().toISOString();

    if (familyCopyTestMethod === "sms") {
      const message = "SMS送信は今後対応予定です。";
      saveFamilyCopyTestResult(record, {
        method: "sms",
        testSentAt: now,
        testSendStatus: "pending",
        testSendError: message
      });
      setFamilyCopyTestStatus({ type: "error", message });
      return;
    }

    const to = record.data.familyCopyDelivery.email.trim();
    if (!to) {
      const message = "親族控えの送信先メールアドレスが未入力です。";
      saveFamilyCopyTestResult(record, {
        method: "email",
        testSentAt: now,
        testSendStatus: "error",
        testSendError: message
      });
      setFamilyCopyTestStatus({ type: "error", message });
      return;
    }

    setSendingFamilyCopyTest(true);
    try {
      const response = await fetch("/api/send-family-copy-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to })
      });
      const result = await response.json().catch(() => ({})) as { ok?: boolean; message?: string; id?: string };
      if (!response.ok || !result.ok) {
        throw new Error(result.message || "親族控え送付テストに失敗しました。");
      }
      saveFamilyCopyTestResult(record, {
        method: "email",
        testSentAt: now,
        testSendStatus: "success",
        testSendError: ""
      });
      setFamilyCopyTestStatus({
        type: "success",
        message: result.id ? `${result.message || "親族控え送付テストメールを送信しました。"}（ID: ${result.id}）` : result.message || "親族控え送付テストメールを送信しました。"
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "親族控え送付テストに失敗しました。";
      saveFamilyCopyTestResult(record, {
        method: "email",
        testSentAt: now,
        testSendStatus: "error",
        testSendError: message
      });
      setFamilyCopyTestStatus({ type: "error", message });
    } finally {
      setSendingFamilyCopyTest(false);
    }
  }

  function editRecord(record: HandoffRecord) {
    if (!canEditCase(currentUser, record)) {
      alert("\u4ed6\u62e0\u70b9\u306e\u6848\u4ef6\u306e\u305f\u3081\u95b2\u89a7\u306e\u307f\u53ef\u80fd\u3067\u3059\u3002");
      return;
    }
    const lockedRecord = acquireHandoffEditLock(record.id);
    if (lockedRecord && isRecordEditedByOther(lockedRecord, currentUser)) {
      const lock = getActiveEditLock(lockedRecord);
      setSelectedId(record.id);
      alert(lock ? `${lock.editingByName}さんが編集中です。必要な場合は「編集を引き継ぐ」を押してください。` : "他の担当者が編集中です。");
      return;
    }
    openHandoffForEditing(lockedRecord || record, record.handoffProgress?.currentStep);
    window.location.href = "/";
  }

  function takeOverAndEdit(record: HandoffRecord) {
    if (!canEditCase(currentUser, record)) return;
    const lockedRecord = acquireHandoffEditLock(record.id, { takeover: true }) || record;
    openHandoffForEditing(lockedRecord, record.handoffProgress?.currentStep);
    window.location.href = "/";
  }

  function deleteRecord(record: HandoffRecord) {
    if (!canDeleteCase(currentUser)) return;
    const targetName = record.deceasedName || record.mournerName || record.id;
    const ok = window.confirm(`この案件を削除します。\n\n対象：${targetName}\n\n削除後は元に戻せません。よろしいですか？`);
    if (!ok) return;
    deleteHandoffRecord(record.id);
    setSelectedRecordIds((current) => current.filter((id) => id !== record.id));
    setSelectedId((current) => current === record.id ? null : current);
    loadRecords();
  }

  function toggleHandoffNoteItem(item: string) {
    const selected = handoffNotesDraft.selectedItems.includes(item)
      ? handoffNotesDraft.selectedItems.filter((value) => value !== item)
      : [...handoffNotesDraft.selectedItems, item];
    setPostWorkDirty(true);
    setHandoffNotesDraft({
      ...handoffNotesDraft,
      selectedItems: selected,
      templeIntroductionWanted: item === "お寺様紹介希望"
        ? selected.includes(item) ? "希望する" : "希望しない"
        : handoffNotesDraft.templeIntroductionWanted
    });
  }

  function applySuggestedHandoffNotes(record: HandoffRecord) {
    const next = Array.from(new Set([...handoffNotesDraft.selectedItems, ...suggestedHandoffNoteItems(record.data)]));
    setPostWorkDirty(true);
    setHandoffNotesDraft({
      ...handoffNotesDraft,
      selectedItems: next,
      templeIntroductionWanted: next.includes("お寺様紹介希望") ? "希望する" : handoffNotesDraft.templeIntroductionWanted
    });
  }

  function buildPostWorkData(record: HandoffRecord) {
    if (!postWorkDraft) return null;
    const current = getCurrentUser();
    const now = new Date().toISOString();
    return {
      ...record.data,
      handoffNotes: {
        ...handoffNotesDraft,
        selectedItems: handoffNotesDraft.selectedItems.map((item) => item.trim()).filter(Boolean)
      },
      postWork: {
        ...postWorkDraft,
        actualMileageKm: postWorkDraft.transportDistanceKm,
        returnTime: "",
        vendorNote: "",
        internalNote: "",
        internalMemo: "",
        finishedAt: postWorkDraft.finishedAt || record.data.relativeConfirmation.confirmedAt || now,
        savedAt: now,
        savedBy: {
          userId: current?.userId || "",
          name: current?.name || ""
        }
      }
    };
  }

  function savePostWork(record: HandoffRecord) {
    if (!canEditCase(currentUser, record)) {
      alert("\u4ed6\u62e0\u70b9\u306e\u6848\u4ef6\u306e\u305f\u3081\u7de8\u96c6\u3067\u304d\u307e\u305b\u3093\u3002");
      return;
    }
    const nextData = buildPostWorkData(record);
    if (!nextData) return;
    const updated = saveHandoffRecord(nextData, { id: record.id, status: advanceStatus(record.status, "業務終了後入力済み"), pdfGenerated: record.pdf.generated });
    loadRecords();
    setSelectedId(updated.id);
    setPostWorkDirty(false);
    alert("業務終了後入力を保存しました。");
  }

  function completePostWork(record: HandoffRecord) {
    if (!canEditCase(currentUser, record)) {
      alert("\u4ed6\u62e0\u70b9\u306e\u6848\u4ef6\u306e\u305f\u3081\u7de8\u96c6\u3067\u304d\u307e\u305b\u3093\u3002");
      return;
    }
    if (!record.data.postWork.savedAt || postWorkDirty) {
      alert("入力完了にする前に、左側の保存ボタンで業務終了後入力を保存してください。");
      return;
    }
    const nextData = buildPostWorkData(record);
    if (!nextData) return;
    saveHandoffRecord(nextData, { id: record.id, status: "完了", pdfGenerated: record.pdf.generated });
    loadRecords();
    alert("入力完了しました。");
    window.location.href = "/dashboard";
  }

  function markInternalCopyStored(record: HandoffRecord) {
    if (!canEditCase(currentUser, record)) return;
    const now = new Date().toISOString();
    const nextData: HandoffData = {
      ...record.data,
      internalCopy: {
        ...record.data.internalCopy,
        sent: true,
        sentAt: now
      }
    };
    const updated = saveHandoffRecord(nextData, { id: record.id, status: advanceStatus(record.status, "完了"), pdfGenerated: record.pdf.generated });
    loadRecords();
    setSelectedId(updated.id);
  }

  function markInternalCopyStoredForSelected() {
    if (!selectableRecords.length) {
      alert("操作する案件を選択してください。");
      return;
    }
    const currentRecords = getHandoffRecords();
    selectedRecordIds.forEach((id) => {
      const record = currentRecords.find((item) => item.id === id);
      if (!record) return;
      if (!canEditCase(currentUser, record)) return;
      const now = new Date().toISOString();
      const nextData: HandoffData = {
        ...record.data,
        internalCopy: {
          ...record.data.internalCopy,
          sent: true,
          sentAt: now
        }
      };
      saveHandoffRecord(nextData, {
        id: record.id,
        status: advanceStatus(record.status, "完了"),
        pdfGenerated: record.pdf.generated
      });
    });
    loadRecords();
    alert("選択した案件を社内保管済みにしました。");
  }

  function exportJsonForSelected() {
    if (!selectableRecords.length) {
      alert("操作する案件を選択してください。");
      return;
    }
    selectableRecords.forEach(exportHandoffRecordJson);
  }

  function printSelectedReports(type: "vendor" | "internal") {
    if (!selectableRecords.length) {
      alert("印刷する案件を選択してください。");
      return;
    }
    setPrintReport(type);
    setPrintJobs(selectableRecords.map((record) => ({ record, type })));
    window.setTimeout(() => window.print(), 80);
  }

  function toggleRecordSelection(id: string) {
    setSelectedRecordIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id]);
  }

  function toggleAllFilteredRecords(checked: boolean) {
    setSelectedRecordIds(checked ? filteredRecords.map((record) => record.id) : []);
  }

  function openBulkMode() {
    setBulkMode(true);
    window.setTimeout(() => document.getElementById("pdf-actions")?.scrollIntoView({ behavior: "smooth", block: "start" }), 0);
  }

  function closeBulkMode() {
    setBulkMode(false);
    setSelectedRecordIds([]);
  }

  if (selected) {
    return (
      <main className="admin-shell">
        <header className="admin-header no-print">
          <div>
            <p className="eyebrow">ダッシュボード</p>
            <h1>業務引継書の詳細</h1>
            <p className="small">最終更新 {formatDateTime(selected.updatedAt)}</p>
          </div>
          <div className="toolbar">
            <AuthStatus />
            <button onClick={() => setSelectedId(null)}><ArrowLeft size={18} /> 一覧へ戻る</button>
            <a className="button-link" href="/">新規作成</a>
            <button className="primary" onClick={() => editRecord(selected)} disabled={isRecordEditedByOther(selected, currentUser)}><Pencil size={18} /> 編集画面へ戻る</button>
            {isRecordEditedByOther(selected, currentUser) ? <button onClick={() => takeOverAndEdit(selected)}>編集を引き継ぐ</button> : null}
          </div>
        </header>

        <section className="admin-summary no-print" aria-label="記録の状態">
          <div><span>拠点</span><strong>{selected.branchName}</strong></div>
          <div><span>業者</span><strong>{selected.vendorName}</strong></div>
          <div><span>故人氏名</span><strong>{selected.deceasedName || "-"}</strong></div>
          <div><span>喪主・代表者</span><strong>{selected.mournerName || "-"}</strong></div>
          <div><span>火葬予約</span><strong>{selected.cremationReservationStatus || "-"}</strong></div>
          <div><span>入力ステータス</span><strong>{statusDisplay(selected.status)}</strong></div>
          <div><span>次にやる事</span><strong>{nextActionForRecord(selected)}</strong></div>
          <div><span>進捗率</span><strong>{progressPercent(selected)}%</strong></div>
          <div><span>編集中</span><strong>{renderEditLock(selected)}</strong></div>
          <div><span>親族確認</span><strong>{selected.data.relativeConfirmation.confirmed ? "確認済み" : "未確認"}</strong></div>
          <div><span>親族控え送付先</span><strong>{familyCopyDeliveryText(selected.data.familyCopyDelivery)}</strong></div>
          <div><span>業者控えPDF</span><strong>{selected.data.vendorCopy.generated ? "保存済み" : "未保存"}</strong></div>
          <div><span>社内控え</span><strong>{selected.data.internalCopy.generated ? "作成済み" : "未作成"} / {selected.data.internalCopy.sent ? "保管済み" : "未保管"}</strong></div>
          <div><span>入力者</span><strong>{selected.createdBy ? `${selected.createdBy.name}（${selected.createdBy.role}）` : "-"}</strong></div>
          <div><span>現場入力完了</span><strong>{formatDateTime(selected.completedAt)}</strong></div>
        </section>

        <PaperReport data={selected.data} />
        <div className="pdf-download-source" aria-hidden="true">
          <div ref={relativePdfRef}>
            <RelativeCopyReport data={(pdfJob?.type === "relative" ? pdfJob.record.data : selected.data)} />
          </div>
          <div ref={vendorPdfRef}>
            <PaperReport data={(pdfJob?.type === "vendor" ? pdfJob.record.data : selected.data)} />
          </div>
          <div ref={internalPdfRef}>
            <InternalStorageReport data={(pdfJob?.type === "internal" ? pdfJob.record.data : selected.data)} />
          </div>
        </div>

        <section className="admin-detail-grid no-print">
          <article className="admin-wide-card">
            <h2>業務終了後入力</h2>
            <p className="small">この枠では、業務終了後の入力と上記選択以外の引き継ぎ事項だけを保存します。PDF保存・印刷・共有は案件一覧で選択して操作してください。</p>
            {postWorkDraft ? (
              <div className="admin-edit-form">
                <div className="admin-edit-columns">
                  <label className="admin-edit-field">
                    <span>搬送距離</span>
                    <input value={postWorkDraft.transportDistanceKm} onChange={(event) => {
                      setPostWorkDirty(true);
                      setPostWorkDraft({ ...postWorkDraft, transportDistanceKm: event.target.value });
                    }} placeholder="例: 2" />
                  </label>
                  <label className="admin-edit-field">
                    <span>業務終了時間</span>
                    <input value={postWorkDraft.finishedAt ? formatFlexibleDateTime(postWorkDraft.finishedAt) : "親族控え確認画面に到達した時点で自動入力"} readOnly />
                  </label>
                </div>
                <label className="admin-edit-field">
                  <span>追加使用品</span>
                  <textarea rows={3} value={postWorkDraft.additionalSupplies} onChange={(event) => {
                    setPostWorkDirty(true);
                    setPostWorkDraft({ ...postWorkDraft, additionalSupplies: event.target.value });
                  }} />
                </label>
                <div className="admin-suggestion-panel">
                  <h3>上記選択以外の引き継ぎ事項</h3>
                  {suggestedHandoffNoteItems(selected.data).length ? (
                    <>
                      <div className="handoff-suggestion-row">
                        {suggestedHandoffNoteItems(selected.data).map((item) => <span key={item}>{item}</span>)}
                      </div>
                      <button type="button" onClick={() => applySuggestedHandoffNotes(selected)}>候補を選択に反映</button>
                    </>
                  ) : (
                    <p className="small">現在の入力内容から自動候補はありません。</p>
                  )}
                  <div className="handoff-check-grid">
                    {getVendorHandoffNoteOptions(selected.data).map((item) => (
                      <label key={item}>
                        <input
                          type="checkbox"
                          checked={handoffNotesDraft.selectedItems.includes(item)}
                          onChange={() => toggleHandoffNoteItem(item)}
                        />
                        <span>{item}</span>
                      </label>
                    ))}
                  </div>
                  <label className="confirmation-check compact">
                    <input
                      type="checkbox"
                      checked={handoffNotesDraft.morningContactToRepresentative}
                      onChange={(event) => {
                        setPostWorkDirty(true);
                        setHandoffNotesDraft({
                          ...handoffNotesDraft,
                          morningContactToRepresentative: event.target.checked
                        });
                      }}
                    />
                    <span>朝の連絡は代表者へ</span>
                  </label>
                  <label className="admin-edit-field">
                    <span>上記選択以外の引き継ぎ事項</span>
                    <textarea
                      rows={4}
                      value={handoffNotesDraft.freeText}
                      onChange={(event) => {
                        setPostWorkDirty(true);
                        setHandoffNotesDraft({ ...handoffNotesDraft, freeText: event.target.value });
                      }}
                      placeholder="上記の選択項目以外で、業者へ引き継ぐ内容を入力してください"
                    />
                  </label>
                </div>
                <p className="small">保存状況: {selected.data.postWork.savedAt ? `${formatDateTime(selected.data.postWork.savedAt)} / ${selected.data.postWork.savedBy.name || "-"}` : "未保存"}</p>
                {!postWorkCompletionReady ? <p className="small">入力完了にするには、先に左側の保存ボタンで業務終了後入力を保存してください。</p> : null}
                <div className="admin-button-row">
                  <button onClick={() => savePostWork(selected)}>業務終了後入力・引き継ぎ事項を保存</button>
                  <button
                    className="primary admin-complete-button"
                    onClick={() => completePostWork(selected)}
                    disabled={!postWorkCompletionReady}
                    title={postWorkCompletionReady ? undefined : "左側の保存ボタンで保存すると押せます"}
                  >
                    入力完了
                  </button>
                </div>
              </div>
            ) : <p className="small">業務終了後入力を読み込めませんでした。</p>}
          </article>

          <article>
            <h2>親族控え送信テスト</h2>
            <dl>
              <div><dt>現在の送付先</dt><dd>{familyCopyDeliveryText(selected.data.familyCopyDelivery)}</dd></div>
              <div><dt>テスト履歴</dt><dd>{selected.data.familyCopyDelivery.testSentAt ? `${formatDateTime(selected.data.familyCopyDelivery.testSentAt)} / ${selected.data.familyCopyDelivery.testSendStatus || "-"}` : "-"}</dd></div>
              {selected.data.familyCopyDelivery.testSendError ? <div><dt>前回エラー</dt><dd>{selected.data.familyCopyDelivery.testSendError}</dd></div> : null}
            </dl>
            <div className="admin-send-test-panel">
              <label>
                <span>送信方法</span>
                <select value={familyCopyTestMethod} onChange={(event) => setFamilyCopyTestMethod(event.target.value as "email" | "sms")}>
                  <option value="email">メール</option>
                  <option value="sms">SMS</option>
                </select>
              </label>
              <p className="small">
                {familyCopyTestMethod === "email"
                  ? `送信先: ${selected.data.familyCopyDelivery.email || "未入力"}`
                  : `送信先: ${selected.data.familyCopyDelivery.smsPhoneNumber || "未入力"}（SMS送信は今後対応予定です）`}
              </p>
              <button onClick={() => sendFamilyCopyTest(selected)} disabled={sendingFamilyCopyTest}>
                <Mail size={18} /> {sendingFamilyCopyTest ? "送信中..." : "親族控え送信テスト"}
              </button>
              {familyCopyTestStatus ? <p className={`send-status ${familyCopyTestStatus.type}`}>{familyCopyTestStatus.message}</p> : null}
            </div>
          </article>

          <article>
            <h2>確認事項</h2>
            {Object.keys(selected.data.vendorQuestions).length ? (
              <dl>{Object.entries(selected.data.vendorQuestions).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "-"}</dd></div>)}</dl>
            ) : <p className="small">追加質問はありません。</p>}
          </article>
        </section>
      </main>
    );
  }

  return (
    <main className={printJobs.length ? "admin-shell printing-reports" : "admin-shell"}>
      <header className="admin-header">
        <div>
          <p className="eyebrow">ダッシュボード</p>
          <h1>{isAdmin ? "全案件一覧" : "現場案件一覧"}</h1>
          <p className="small">{isAdmin ? "全拠点・全案件を確認できます。" : "ログイン中アカウントの拠点案件を確認できます。"}</p>
        </div>
        <div className="toolbar">
          <AuthStatus />
          <button onClick={loadRecords}><RefreshCw size={18} /> 更新</button>
          <a className="button-link primary" href="/">新規作成</a>
          <a className="button-link" href="#records">案件一覧</a>
          <button onClick={openBulkMode}>PDF保存・印刷・共有</button>
          {isAdmin ? <a className="button-link" href="/admin/master">設定</a> : null}
        </div>
      </header>
      <SyncStatusBanner />

      <section className="admin-filters" aria-label="一覧の絞り込み">
        <select value={filters.branch} onChange={(event) => setFilters({ ...filters, branch: event.target.value })}>
          <option value="">すべての拠点</option>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        <select value={filters.vendor} onChange={(event) => setFilters({ ...filters, vendor: event.target.value })}>
          <option value="">すべての業者</option>
          {Object.values(vendors).map((vendor) => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}
        </select>
        <input type="date" value={filters.date} onChange={(event) => setFilters({ ...filters, date: event.target.value })} aria-label="受付日" />
        <input
          placeholder="検索"
          aria-label="故人氏名・喪主または代表者・対応ドライバーを検索"
          value={filters.keyword}
          onChange={(event) => setFilters({ ...filters, keyword: event.target.value })}
        />
        <select value={filters.reservation} onChange={(event) => setFilters({ ...filters, reservation: event.target.value })}>
          <option value="">火葬予約: すべて</option>
          <option value="済">火葬予約: 済</option>
          <option value="未">火葬予約: 未</option>
        </select>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })}>
          {statuses.map((status) => <option key={status || "all"} value={status}>{status ? statusDisplay(status) : "入力ステータス: すべて"}</option>)}
        </select>
      </section>

      {bulkMode ? (
        <section id="pdf-actions" className="admin-bulk-actions" aria-label="選択案件のPDF保存・印刷・共有操作">
          <div>
            <h2>PDF保存・印刷・共有</h2>
            <p className="small">PDFを保存し、保存したPDFを印刷またはLINE WORKSのトークで共有してください。</p>
          </div>
          <div className="admin-bulk-status">
            <strong>{selectableRecords.length}</strong>
            <span>件選択中</span>
          </div>
          <div className="admin-button-row">
            <button className="primary" onClick={() => recreatePdfForSelected("vendor")} disabled={!selectableRecords.length}><FileDown size={18} /> 業者控えPDFを保存</button>
            <button onClick={() => recreatePdfForSelected("internal")} disabled={!selectableRecords.length}><FileDown size={18} /> 社内控えPDFを保存</button>
            <button onClick={() => recreatePdfForSelected("relative")} disabled={!selectableRecords.length}><FileDown size={18} /> 親族控えPDFを保存</button>
            {isAdmin ? <button onClick={exportJsonForSelected} disabled={!selectableRecords.length}><FileJson size={18} /> JSON</button> : null}
            <button onClick={markInternalCopyStoredForSelected} disabled={!selectableRecords.length}>社内保管済み</button>
            <button onClick={() => printSelectedReports("vendor")} disabled={!selectableRecords.length}>業者控えを印刷</button>
            <button onClick={() => printSelectedReports("internal")} disabled={!selectableRecords.length}>社内控えを印刷</button>
            <button onClick={shareVendorPdfForSelected} disabled={!selectableRecords.length}>PDFを共有</button>
            <button onClick={closeBulkMode}>選択を閉じる</button>
          </div>
        </section>
      ) : null}

      <section id="records" className="admin-table-wrap">
        <table className={bulkMode ? "admin-table selection-mode" : "admin-table"}>
          <thead><tr>{bulkMode ? <th><input type="checkbox" aria-label="表示中の案件をすべて選択" checked={filteredRecords.length > 0 && selectableRecords.length === filteredRecords.length} onChange={(event) => toggleAllFilteredRecords(event.target.checked)} /></th> : null}<th>ステータス</th><th>次にやる事</th><th>進捗率</th><th>同期</th><th>編集中</th><th>受付日時</th><th>拠点</th><th>業者</th><th>故人氏名</th><th>喪主・代表者</th><th>対応ドライバー</th><th>火葬予約</th><th>PDF</th><th>最終更新</th><th>最終更新者</th><th>操作</th></tr></thead>
          <tbody>
            {filteredRecords.map((record) => (
              <tr key={record.id} tabIndex={0} onClick={() => setSelectedId(record.id)} onKeyDown={(event) => event.key === "Enter" && setSelectedId(record.id)}>
                {bulkMode ? <td><input type="checkbox" aria-label={`${record.deceasedName || "未入力"}を選択`} checked={selectedRecordIds.includes(record.id)} onClick={(event) => event.stopPropagation()} onChange={() => toggleRecordSelection(record.id)} /></td> : null}
                <td><span className="status-chip">{statusDisplay(record.status)}</span></td>
                <td>{nextActionForRecord(record)}</td>
                <td><span className={progressPercent(record) < 100 ? "progress-pill incomplete" : "progress-pill"}><span className="progress-fill" style={{ width: `${progressPercent(record)}%` }} /><strong>{progressPercent(record)}%</strong></span></td>
                <td>
                  <span className={`sync-chip ${record.syncStatus}`} title={record.syncError || syncStatusLabel(record.syncStatus)}>
                    {syncStatusLabel(record.syncStatus)}
                  </span>
                  {record.syncError ? <span className="sync-error-detail">{record.syncError}</span> : null}
                </td>
                <td>{renderEditLock(record)}</td>
                <td>{formatDateTime(record.createdAt)}</td><td>{record.branchName}</td><td>{record.vendorName}</td><td>{record.deceasedName || "-"}</td><td>{record.mournerName || "-"}</td><td>{record.assignedDriver?.name || record.createdBy?.name || "-"}</td>
                <td>{record.cremationReservationStatus || "-"}</td><td>{record.pdf.generated ? "作成済み" : "未作成"}</td><td>{formatDateTime(record.updatedAt)}</td><td>{updatedByName(record)}</td>
                <td>
                  <div className="table-actions compact-actions">
                    <button onClick={(event) => { event.stopPropagation(); editRecord(record); }} disabled={isRecordEditedByOther(record, currentUser)}>入力再開</button>
                    {isRecordEditedByOther(record, currentUser) ? <button onClick={(event) => { event.stopPropagation(); takeOverAndEdit(record); }}>編集を引き継ぐ</button> : null}
                    <button onClick={(event) => { event.stopPropagation(); setSelectedId(record.id); }}>詳細</button>
                    {isAdmin ? <button className="danger-button" onClick={(event) => { event.stopPropagation(); deleteRecord(record); }}>削除</button> : null}
                  </div>
                </td>
              </tr>
            ))}
            {!filteredRecords.length ? <tr><td colSpan={bulkMode ? 17 : 16} className="empty-state">保存済みの業務引継書はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>

      <div className="pdf-download-source" aria-hidden="true">
        <div ref={relativePdfRef}>
          {pdfJob ? <RelativeCopyReport data={pdfJob.record.data} /> : null}
        </div>
        <div ref={vendorPdfRef}>
          {pdfJob ? <PaperReport data={pdfJob.record.data} /> : null}
        </div>
        <div ref={internalPdfRef}>
          {pdfJob ? <InternalStorageReport data={pdfJob.record.data} /> : null}
        </div>
      </div>
      <div className="print-only admin-print-source">
        {printJobs.map(({ record, type }) => (
          <div className="admin-print-page" key={`${record.id}-${type}`}>
            {type === "vendor" ? <PaperReport data={record.data} /> : <InternalStorageReport data={record.data} />}
          </div>
        ))}
      </div>
    </main>
  );
}
