import { doc, getDocs, collection, setDoc } from "firebase/firestore";
import { ensureFirebaseAuthSession, getFirebaseDb, isFirebaseConfigured } from "@/lib/firebaseClient";
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
    throw new Error("Firebase設定が未登録です。端末内に保存しました。");
  }

  const user = await ensureFirebaseAuthSession();
  const documentRef = doc(db, handoffCollectionName, record.id);
  console.info("[Firestore sync] setDoc start.", {
    collection: handoffCollectionName,
    recordId: record.id,
    auth: user ? "signed-in" : "none"
  });

  try {
    await setDoc(documentRef, toFirestoreRecord(record), { merge: true });
    console.info("[Firestore sync] setDoc succeeded.", {
      collection: handoffCollectionName,
      recordId: record.id
    });
  } catch (error) {
    const firebaseError = error as { code?: string; message?: string };
    console.error("[Firestore sync] setDoc failed.", {
      collection: handoffCollectionName,
      recordId: record.id,
      code: firebaseError.code,
      message: firebaseError.message,
      error
    });
    logClientSyncError("Firestore setDoc failed.", {
      collection: handoffCollectionName,
      recordId: record.id,
      code: firebaseError.code || "",
      message: firebaseError.message || ""
    });
    throw error;
  }
}

export async function getCloudHandoffRecords() {
  const db = getFirebaseDb();
  if (!canUseFirebase() || !db) return [];
  const snapshot = await getDocs(collection(db, handoffCollectionName));
  return snapshot.docs.map((item) => item.data() as HandoffRecord);
}
