import { collection, deleteDoc, doc, getDocs, onSnapshot, setDoc, type Unsubscribe } from "firebase/firestore";
import {
  ensureFirebaseAuthSession,
  getFirebaseDb,
  getFirebaseDebugInfo,
  isFirebaseConfigured
} from "@/lib/firebaseClient";
import type { HandoffRecord } from "@/lib/handoffStorage";

const handoffCollectionName = "handoffRecords";

function canUseFirebase() {
  return typeof window !== "undefined" && isFirebaseConfigured();
}

function sanitizeForFirestore(value: unknown): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeForFirestore(item));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, sanitizeForFirestore(item)])
    );
  }
  return null;
}

function toFirestoreRecord(record: HandoffRecord): Record<string, unknown> {
  return sanitizeForFirestore({
    ...record,
    cloudUpdatedAt: new Date().toISOString()
  }) as Record<string, unknown>;
}

function fromFirestoreRecord(id: string, data: unknown): HandoffRecord {
  const record = data as HandoffRecord & { cloudUpdatedAt?: string };
  return {
    ...record,
    id: record.id || id,
    syncStatus: "synced",
    lastSyncedAt: record.lastSyncedAt || record.cloudUpdatedAt || record.updatedAt || new Date().toISOString(),
    syncError: ""
  };
}

function firebaseErrorMessage(error: unknown) {
  const firebaseError = error as { code?: string; message?: string };
  if (firebaseError.code && firebaseError.message) return `${firebaseError.code}: ${firebaseError.message}`;
  if (firebaseError.message) return firebaseError.message;
  return "Firestore同期に失敗しました。";
}

function logClientSyncError(message: string, details: Record<string, unknown>) {
  if (typeof window === "undefined") return;
  void fetch("/api/client-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ level: "error", message, details })
  }).catch(() => {
    // Keep the original Firestore error as the important failure.
  });
}

export function isCloudSaveAvailable() {
  return canUseFirebase() && Boolean(getFirebaseDb());
}

export async function saveHandoffRecordToCloud(record: HandoffRecord) {
  const db = getFirebaseDb();
  if (!canUseFirebase() || !db) {
    console.error("[Firestore sync] Firebase is not configured.", {
      collection: handoffCollectionName,
      recordId: record.id,
      debug: getFirebaseDebugInfo()
    });
    throw new Error("Firebase設定が未登録です。Vercelの環境変数を確認してください。");
  }

  let user;
  try {
    user = await ensureFirebaseAuthSession();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firebase Authenticationの匿名ログインに失敗しました。";
    console.error("[Firestore sync] Anonymous auth failed before setDoc.", {
      collection: handoffCollectionName,
      recordId: record.id,
      message,
      debug: getFirebaseDebugInfo(),
      error
    });
    logClientSyncError("Firebase anonymous auth failed.", {
      collection: handoffCollectionName,
      recordId: record.id,
      message,
      ...getFirebaseDebugInfo()
    });
    throw new Error(message);
  }
  if (!user) {
    const message =
      "Firebase Authenticationの匿名ログインに失敗しました。Firebase ConsoleでAuthenticationの匿名ログインが有効か確認してください。";
    console.error("[Firestore sync] Auth session is missing.", {
      collection: handoffCollectionName,
      recordId: record.id,
      debug: getFirebaseDebugInfo()
    });
    logClientSyncError("Firebase anonymous auth failed.", {
      collection: handoffCollectionName,
      recordId: record.id,
      ...getFirebaseDebugInfo()
    });
    throw new Error(message);
  }

  const documentRef = doc(db, handoffCollectionName, record.id);
  console.info("[Firestore sync] setDoc start.", {
    collection: handoffCollectionName,
    recordId: record.id,
    path: `${handoffCollectionName}/${record.id}`,
    auth: "signed-in",
    uid: user.uid,
    debug: getFirebaseDebugInfo()
  });

  try {
    await setDoc(documentRef, toFirestoreRecord(record), { merge: true });
    console.info("[Firestore sync] setDoc succeeded.", {
      collection: handoffCollectionName,
      recordId: record.id,
      path: `${handoffCollectionName}/${record.id}`
    });
  } catch (error) {
    const firebaseError = error as { code?: string; message?: string };
    const message = firebaseErrorMessage(error);
    console.error("[Firestore sync] setDoc failed.", {
      collection: handoffCollectionName,
      recordId: record.id,
      path: `${handoffCollectionName}/${record.id}`,
      code: firebaseError.code,
      message: firebaseError.message,
      debug: getFirebaseDebugInfo(),
      error
    });
    logClientSyncError("Firestore setDoc failed.", {
      collection: handoffCollectionName,
      recordId: record.id,
      path: `${handoffCollectionName}/${record.id}`,
      code: firebaseError.code || "",
      message,
      ...getFirebaseDebugInfo()
    });
    throw new Error(message);
  }
}

export async function getCloudHandoffRecords() {
  const db = getFirebaseDb();
  if (!canUseFirebase() || !db) return [];

  let user;
  try {
    user = await ensureFirebaseAuthSession();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firebase Authenticationの匿名ログインに失敗しました。";
    console.error("[Firestore sync] getDocs skipped because anonymous auth failed.", {
      collection: handoffCollectionName,
      message,
      debug: getFirebaseDebugInfo(),
      error
    });
    logClientSyncError("Firebase anonymous auth failed before getDocs.", {
      collection: handoffCollectionName,
      message,
      ...getFirebaseDebugInfo()
    });
    return [];
  }
  if (!user) {
    console.error("[Firestore sync] getDocs skipped because auth session is missing.", {
      collection: handoffCollectionName,
      debug: getFirebaseDebugInfo()
    });
    return [];
  }

  try {
    console.info("[Firestore sync] getDocs start.", {
      collection: handoffCollectionName,
      auth: "signed-in",
      uid: user.uid,
      debug: getFirebaseDebugInfo()
    });
    const snapshot = await getDocs(collection(db, handoffCollectionName));
    console.info("[Firestore sync] getDocs succeeded.", {
      collection: handoffCollectionName,
      count: snapshot.docs.length
    });
    return snapshot.docs.map((item) => fromFirestoreRecord(item.id, item.data()));
  } catch (error) {
    const firebaseError = error as { code?: string; message?: string };
    const message = firebaseErrorMessage(error);
    console.error("[Firestore sync] getDocs failed.", {
      collection: handoffCollectionName,
      code: firebaseError.code,
      message: firebaseError.message,
      debug: getFirebaseDebugInfo(),
      error
    });
    logClientSyncError("Firestore getDocs failed.", {
      collection: handoffCollectionName,
      code: firebaseError.code || "",
      message,
      ...getFirebaseDebugInfo()
    });
    return [];
  }
}

export async function deleteHandoffRecordFromCloud(recordId: string) {
  const db = getFirebaseDb();
  if (!canUseFirebase() || !db) return;
  const user = await ensureFirebaseAuthSession();
  if (!user) return;
  await deleteDoc(doc(db, handoffCollectionName, recordId));
}

export async function subscribeCloudHandoffRecords(
  onRecords: (records: HandoffRecord[]) => void,
  onError?: (message: string) => void
): Promise<Unsubscribe | null> {
  const db = getFirebaseDb();
  if (!canUseFirebase() || !db) return null;

  try {
    const user = await ensureFirebaseAuthSession();
    if (!user) return null;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Firebase Authentication縺ｮ蛹ｿ蜷阪Ο繧ｰ繧､繝ｳ縺ｫ螟ｱ謨励＠縺ｾ縺励◆縲・";
    console.error("[Firestore sync] onSnapshot skipped because auth failed.", {
      collection: handoffCollectionName,
      message,
      debug: getFirebaseDebugInfo(),
      error
    });
    onError?.(message);
    return null;
  }

  console.info("[Firestore sync] onSnapshot start.", {
    collection: handoffCollectionName,
    debug: getFirebaseDebugInfo()
  });

  return onSnapshot(
    collection(db, handoffCollectionName),
    (snapshot) => {
      const records = snapshot.docs.map((item) => fromFirestoreRecord(item.id, item.data()));
      console.info("[Firestore sync] onSnapshot received.", {
        collection: handoffCollectionName,
        count: records.length
      });
      onRecords(records);
    },
    (error) => {
      const firebaseError = error as { code?: string; message?: string };
      const message = firebaseErrorMessage(error);
      console.error("[Firestore sync] onSnapshot failed.", {
        collection: handoffCollectionName,
        code: firebaseError.code,
        message: firebaseError.message,
        debug: getFirebaseDebugInfo(),
        error
      });
      logClientSyncError("Firestore onSnapshot failed.", {
        collection: handoffCollectionName,
        code: firebaseError.code || "",
        message,
        ...getFirebaseDebugInfo()
      });
      onError?.(message);
    }
  );
}
