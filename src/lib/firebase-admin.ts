import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function adminEnv() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = normalizePrivateKey(process.env.FIREBASE_ADMIN_PRIVATE_KEY);

  console.log("[Firebase Admin] env presence", {
    projectId: Boolean(projectId),
    clientEmail: Boolean(clientEmail),
    privateKey: Boolean(privateKey)
  });

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin SDK\u306e\u74b0\u5883\u5909\u6570\u304c\u672a\u8a2d\u5b9a\u3067\u3059\u3002");
  }

  return { projectId, clientEmail, privateKey };
}

function normalizePrivateKey(value: string | undefined) {
  if (!value) return undefined;
  let key = value.trim();

  if (key.startsWith("{")) {
    try {
      const parsed = JSON.parse(key) as { private_key?: unknown };
      if (typeof parsed.private_key === "string") key = parsed.private_key.trim();
    } catch {
      // Keep the original value and validate it below.
    }
  }

  key = key
    .replace(/^["'`]|["'`]$/g, "")
    .replace(/\\r\\n/g, "\n")
    .replace(/\\n/g, "\n")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();

  if (!key.includes("-----BEGIN PRIVATE KEY-----") || !key.includes("-----END PRIVATE KEY-----")) {
    throw new Error("Firebase Admin SDK\u306e\u79d8\u5bc6\u9375\u5f62\u5f0f\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002FIREBASE_ADMIN_PRIVATE_KEY\u306bprivate_key\u306e\u5024\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002");
  }

  return key;
}

export function getFirebaseAdmin() {
  try {
    const { projectId, clientEmail, privateKey } = adminEnv();
    const adminApp =
      getApps().length > 0
        ? getApps()[0]
        : initializeApp({
            credential: cert({
              projectId,
              clientEmail,
              privateKey
            })
          });

    return {
      auth: getAuth(adminApp),
      db: getFirestore(adminApp)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("private key") || message.includes("DECODER")) {
      throw new Error("Firebase Admin SDK\u306e\u79d8\u5bc6\u9375\u5f62\u5f0f\u304c\u6b63\u3057\u304f\u3042\u308a\u307e\u305b\u3093\u3002FIREBASE_ADMIN_PRIVATE_KEY\u306bprivate_key\u306e\u5024\u3092\u8a2d\u5b9a\u3057\u3066\u304f\u3060\u3055\u3044\u3002");
    }
    throw error;
  }
}

