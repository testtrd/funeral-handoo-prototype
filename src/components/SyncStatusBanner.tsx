"use client";

import { RefreshCw } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  getHandoffRecords,
  getNetworkStatus,
  getPendingOfflineRecords,
  syncPendingRecords,
  type HandoffSyncStatus
} from "@/lib/handoffStorage";

function statusText(status: HandoffSyncStatus, pendingCount: number) {
  if (status === "synced") return "全案件：端末保存済み / クラウド同期済み";
  if (status === "offline_pending") {
    return `全案件：端末保存済み / クラウド同期待ち${pendingCount ? `（${pendingCount}件）` : ""}`;
  }
  if (status === "syncing") return "全案件：端末保存済み / 同期中";
  return `全案件：端末保存済み / 同期エラー${pendingCount ? `（${pendingCount}件）` : ""}`;
}

function firstSyncMessage() {
  const record = getPendingOfflineRecords().find((item) => item.syncError);
  return record?.syncError || "";
}

export function SyncStatusBanner() {
  const [syncStatus, setSyncStatus] = useState<HandoffSyncStatus>("synced");
  const [pendingCount, setPendingCount] = useState(0);
  const [message, setMessage] = useState("");
  const syncingRef = useRef(false);

  function refreshStatus() {
    const records = getHandoffRecords();
    const pending = getPendingOfflineRecords();
    let nextStatus: HandoffSyncStatus = "synced";
    setPendingCount(pending.length);
    if (getNetworkStatus() === "offline") {
      nextStatus = pending.length ? "offline_pending" : "synced";
    } else if (records.some((record) => record.syncStatus === "syncing")) {
      nextStatus = "syncing";
    } else if (pending.some((record) => record.syncStatus === "sync_failed")) {
      nextStatus = "sync_failed";
    } else if (pending.length) {
      nextStatus = "offline_pending";
    }
    setSyncStatus(nextStatus);
    if (nextStatus === "synced") {
      setMessage("");
    } else {
      setMessage(firstSyncMessage());
    }
    return { nextStatus, pendingCount: pending.length };
  }

  async function runSync() {
    if (syncingRef.current || getNetworkStatus() === "offline") {
      console.info("[Cloud sync] resync skipped.", {
        syncing: syncingRef.current,
        networkStatus: getNetworkStatus()
      });
      refreshStatus();
      return;
    }
    syncingRef.current = true;
    setSyncStatus("syncing");
    try {
      const pendingBeforeSync = getPendingOfflineRecords();
      console.info("[Cloud sync] resync button/action started.", { pendingCount: pendingBeforeSync.length });
      const result = await syncPendingRecords();
      const pendingAfterSync = getPendingOfflineRecords();
      console.info("[Cloud sync] resync button/action finished.", {
        result,
        pendingCount: pendingAfterSync.length
      });
      refreshStatus();
      if (pendingAfterSync.length) {
        setMessage(firstSyncMessage() || result.message);
      } else {
        setMessage("");
      }
    } catch (error) {
      console.error("[Cloud sync] resync button/action failed.", error);
      setMessage(error instanceof Error ? error.message : "同期に失敗しました。");
    } finally {
      syncingRef.current = false;
    }
  }

  useEffect(() => {
    const initial = refreshStatus();
    if (getNetworkStatus() === "online" && initial.pendingCount) {
      void runSync();
    }
    const onOnline = () => {
      void runSync();
    };
    const onOffline = () => refreshStatus();
    const onRecordsUpdated = () => refreshStatus();
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("funeral-handoff-records-updated", onRecordsUpdated);
    window.addEventListener("storage", onRecordsUpdated);
    const timer = window.setInterval(() => {
      const current = refreshStatus();
      if (getNetworkStatus() === "online" && current.pendingCount) {
        void runSync();
      }
    }, 5000);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("funeral-handoff-records-updated", onRecordsUpdated);
      window.removeEventListener("storage", onRecordsUpdated);
      window.clearInterval(timer);
    };
  }, []);

  const visibleStatus = getNetworkStatus() === "offline" && pendingCount ? "offline_pending" : syncStatus;

  return (
    <div className={`sync-banner ${visibleStatus}`}>
      <span>{statusText(visibleStatus, pendingCount)}</span>
      {message ? <span className="sync-banner-message">詳細: {message}</span> : null}
      {pendingCount || visibleStatus === "sync_failed" ? (
        <button type="button" onClick={runSync} disabled={getNetworkStatus() === "offline" || visibleStatus === "syncing"}>
          <RefreshCw size={16} /> 再同期
        </button>
      ) : null}
    </div>
  );
}
