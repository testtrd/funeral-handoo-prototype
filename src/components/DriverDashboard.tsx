"use client";

import { CheckCircle, Eye, Pencil, Play, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { AuthStatus } from "@/components/AuthGate";
import { SyncStatusBanner } from "@/components/SyncStatusBanner";
import { getCurrentUser, type AuthSession } from "@/lib/authService";
import { getHandoffRecords, nextActionForRecord, openHandoffForEditing, progressPercentForStatus, saveHandoffRecord, subscribeHandoffRecords, syncStatusLabel, type HandoffRecord, type HandoffRecordStatus } from "@/lib/handoffStorage";

const driverOperableStatuses = ["入力中", "現場入力完了"];

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("ja-JP", { dateStyle: "short", timeStyle: "short" }).format(new Date(value));
}

function destinationText(record: HandoffRecord) {
  return [record.data.transport.destinationType, record.data.transport.destinationPlace].filter(Boolean).join(" ") || "-";
}

function updatedByName(record: HandoffRecord) {
  return record.updatedBy?.name || record.createdBy?.name || "-";
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

function isAssignedToUser(record: HandoffRecord, user: AuthSession) {
  return record.createdBy?.userId === user.userId || record.assignedDriver?.userId === user.userId;
}

function userBranchIds(user: AuthSession) {
  if (Array.isArray(user.branchIds) && user.branchIds.length) return user.branchIds.filter(Boolean);
  return user.branchId ? [user.branchId] : [];
}

function isInUserBranch(record: HandoffRecord, user: AuthSession) {
  const branchIds = userBranchIds(user);
  return branchIds.includes(record.branchId);
}

function canOperateRecord(record: HandoffRecord, user: AuthSession) {
  if (user.role !== "driver") return true;
  return (isInUserBranch(record, user) || isAssignedToUser(record, user)) && driverOperableStatuses.includes(record.status);
}

function inferResumeStep(record: HandoffRecord) {
  if (typeof record.handoffProgress?.currentStep === "number") return Math.min(record.handoffProgress.currentStep, 14);
  if (record.status === "現場入力完了") return 14;
  return 0;
}

export default function DriverDashboard() {
  const [user, setUser] = useState<AuthSession | null>(null);
  const [records, setRecords] = useState<HandoffRecord[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  function loadRecords() {
    const current = getCurrentUser();
    setUser(current);
    setRecords(getHandoffRecords());
  }

  useEffect(() => {
    return subscribeHandoffRecords(() => loadRecords(), 5000);
  }, []);

  const visibleRecords = useMemo(() => {
    if (!user) return [];
    if (user.role === "admin") return records;
    const branchIds = userBranchIds(user);
    if (branchIds.length) {
      return records.filter((record) => branchIds.includes(record.branchId));
    }
    return records.filter((record) => isAssignedToUser(record, user));
  }, [records, user]);

  const activeRecords = visibleRecords.filter((record) => driverOperableStatuses.includes(record.status) && record.status !== "現場入力完了");
  const fieldCompletedRecords = visibleRecords.filter((record) => record.status === "現場入力完了");
  const selected = visibleRecords.find((record) => record.id === selectedId) || null;

  function resumeRecord(record: HandoffRecord, step = inferResumeStep(record)) {
    if (!user || !canOperateRecord(record, user)) return;
    openHandoffForEditing(record, step);
    window.location.href = "/";
  }

  function markFieldCompleted(record: HandoffRecord) {
    if (!user || !canOperateRecord(record, user)) return;
    const updated = saveHandoffRecord(record.data, {
      id: record.id,
      status: "現場入力完了",
      pdfGenerated: record.pdf.generated,
      currentStep: 14,
      currentStepName: "親族控え確認"
    });
    setRecords(getHandoffRecords());
    setSelectedId(updated.id);
    setMessage("案件を現場入力完了にしました。");
  }

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div>
          <p className="eyebrow">ダッシュボード</p>
          <h1>案件一覧</h1>
          <p className="small">ログイン中アカウントの拠点案件を確認できます。入力途中の案件はここから再開できます。</p>
        </div>
        <div className="toolbar">
          <AuthStatus />
          <button onClick={loadRecords}><RefreshCw size={18} /> 更新</button>
          <a className="button-link primary" href="/">新規作成</a>
          {user?.role !== "driver" ? <a className="button-link" href="/admin">管理画面</a> : null}
          {user?.role === "admin" ? <a className="button-link" href="/admin/master">マスター管理</a> : null}
        </div>
      </header>
      <SyncStatusBanner />

      <section className="admin-summary" aria-label="案件の状態">
        <div><span>表示中の案件</span><strong>{visibleRecords.length}件</strong></div>
        <div><span>入力途中</span><strong>{activeRecords.length}件</strong></div>
        <div><span>現場入力完了</span><strong>{fieldCompletedRecords.length}件</strong></div>
        <div><span>ログイン</span><strong>{user ? `${user.name}（${user.role}）` : "-"}</strong></div>
      </section>

      {message ? <p className="send-status success">{message}</p> : null}

      <section className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>ステータス</th>
              <th>次にやる事</th>
              <th>進捗率</th>
              <th>同期</th>
              <th>作成日時</th>
              <th>拠点</th>
              <th>業者</th>
              <th>故人氏名</th>
              <th>喪主・代表者</th>
              <th>搬送先</th>
              <th>火葬予約</th>
              <th>最終更新</th>
              <th>最終更新者</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {visibleRecords.map((record) => {
              const canOperate = user ? canOperateRecord(record, user) : false;
              return (
                <tr key={record.id} tabIndex={0} onClick={() => setSelectedId(record.id)} onKeyDown={(event) => event.key === "Enter" && setSelectedId(record.id)}>
                  <td><span className="status-chip">{statusDisplay(record.status)}</span></td>
                  <td>{nextActionForRecord(record)}</td>
                  <td><span className={progressPercent(record) < 100 ? "progress-pill incomplete" : "progress-pill"}><span className="progress-fill" style={{ width: `${progressPercent(record)}%` }} /><strong>{progressPercent(record)}%</strong></span></td>
                  <td>
                    <span className={`sync-chip ${record.syncStatus}`} title={record.syncError || syncStatusLabel(record.syncStatus)}>
                      {syncStatusLabel(record.syncStatus)}
                    </span>
                    {record.syncError ? <span className="sync-error-detail">{record.syncError}</span> : null}
                  </td>
                  <td>{formatDateTime(record.createdAt)}</td>
                  <td>{record.branchName}</td>
                  <td>{record.vendorName}</td>
                  <td>{record.deceasedName || "-"}</td>
                  <td>{record.mournerName || "-"}</td>
                  <td>{destinationText(record)}</td>
                  <td>{record.cremationReservationStatus || "-"}</td>
                  <td>{formatDateTime(record.updatedAt)}</td>
                  <td>{updatedByName(record)}</td>
                  <td>
                    <div className="table-actions">
                      <button onClick={(event) => { event.stopPropagation(); resumeRecord(record); }} disabled={!canOperate}>
                        <Play size={16} /> 入力を再開
                      </button>
                      <button onClick={(event) => { event.stopPropagation(); resumeRecord(record, 14); }} disabled={!canOperate}>
                        <Pencil size={16} /> 親族控え確認
                      </button>
                      <button onClick={(event) => { event.stopPropagation(); markFieldCompleted(record); }} disabled={!canOperate || record.status === "現場入力完了"}>
                        <CheckCircle size={16} /> 現場入力完了
                      </button>
                      <button onClick={(event) => { event.stopPropagation(); setSelectedId(record.id); }}>
                        <Eye size={16} /> 詳細
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!visibleRecords.length ? <tr><td colSpan={14} className="empty-state">表示できる案件はありません。</td></tr> : null}
          </tbody>
        </table>
      </section>

      {selected ? (
        <section className="admin-detail-grid dashboard-detail">
          <article>
            <h2>案件詳細</h2>
            <dl>
              <div><dt>ステータス</dt><dd>{statusDisplay(selected.status)}</dd></div>
              <div><dt>次にやる事</dt><dd>{nextActionForRecord(selected)}</dd></div>
              <div><dt>進捗率</dt><dd>{progressPercent(selected)}%</dd></div>
              <div><dt>拠点</dt><dd>{selected.branchName}</dd></div>
              <div><dt>業者</dt><dd>{selected.vendorName}</dd></div>
              <div><dt>故人氏名</dt><dd>{selected.deceasedName || "-"}</dd></div>
              <div><dt>喪主・代表者</dt><dd>{selected.mournerName || "-"}</dd></div>
              <div><dt>搬送先</dt><dd>{destinationText(selected)}</dd></div>
              <div><dt>火葬予約</dt><dd>{selected.cremationReservationStatus || "-"}</dd></div>
              <div><dt>担当ドライバー</dt><dd>{selected.assignedDriver?.name || selected.createdBy?.name || "-"}</dd></div>
              <div><dt>最終更新</dt><dd>{formatDateTime(selected.updatedAt)}</dd></div>
            </dl>
          </article>
          <article>
            <h2>操作</h2>
            <div className="admin-button-row">
              <button className="primary" onClick={() => resumeRecord(selected)} disabled={!user || !canOperateRecord(selected, user)}>
                <Play size={18} /> 入力を再開
              </button>
              <button onClick={() => resumeRecord(selected, 14)} disabled={!user || !canOperateRecord(selected, user)}>
                <Pencil size={18} /> 親族控え確認へ進む
              </button>
              <button onClick={() => markFieldCompleted(selected)} disabled={!user || !canOperateRecord(selected, user) || selected.status === "現場入力完了"}>
                <CheckCircle size={18} /> 現場入力完了にする
              </button>
            </div>
            {user?.role === "driver" ? (
              <p className="small">業者控えPDF、社内控えPDFの保存・印刷・共有、JSON出力、マスター管理は管理画面側で行います。</p>
            ) : (
              <p className="small">管理処理は管理画面の案件詳細から行えます。</p>
            )}
          </article>
        </section>
      ) : null}
    </main>
  );
}
