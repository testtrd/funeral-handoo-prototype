import { NextResponse } from "next/server";
import { completeOwnPasswordChange } from "@/lib/firebaseAdminServer";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    await completeOwnPasswordChange(request);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "パスワード変更後の保存に失敗しました。";
    console.error("[api/auth/password-changed] update failed.", error);
    return NextResponse.json({ ok: false, message }, { status: 400 });
  }
}
