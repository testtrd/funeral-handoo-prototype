import { NextResponse } from "next/server";
import { syncOwnUserClaims } from "@/lib/firebaseAdminServer";

function errorStatus(message: string) {
  if (message.includes("ログイン")) return 401;
  if (message.includes("利用できません") || message.includes("見つかりません")) return 403;
  return 500;
}

export async function POST(request: Request) {
  try {
    const result = await syncOwnUserClaims(request);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Custom Claimsの同期に失敗しました。";
    console.error("[api/auth/sync-claims] sync failed.", { message });
    return NextResponse.json({ ok: false, message }, { status: errorStatus(message) });
  }
}
