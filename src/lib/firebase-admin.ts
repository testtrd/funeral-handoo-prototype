import "server-only";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

function adminEnv() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_ADMIN_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n");

  console.log("[Firebase Admin] env presence", {
    projectId: Boolean(projectId),
    clientEmail: Boolean(clientEmail),
    privateKey: Boolean(privateKey)
  });

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Firebase Admin SDKの環境変数が未設定です。");
  }

  return { projectId, clientEmail, privateKey };
}

export function getFirebaseAdmin() {
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
}
