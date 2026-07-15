import { NextResponse } from "next/server";
import { resetEmployeePassword } from "@/lib/firebaseAdminServer";
import type { ResetUserPasswordInput } from "@/lib/userAccountTypes";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message.includes("ログイン") || message.includes("繝ｭ繧ｰ繧､繝ｳ")) return 401;
  if (message.includes("権限") || message.includes("讓ｩ髯")) return 403;
  if (message.includes("環境変数") || message.includes("迺ｰ蠅")) return 500;
  return 400;
}

export async function POST(request: Request, context: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await context.params;
    const body = (await request.json().catch(() => ({}))) as ResetUserPasswordInput;
    const user = await resetEmployeePassword(request, uid, body);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "初期パスワードの再発行に失敗しました。";
    console.error("[api/admin/users/password] reset failed.", error);
    return NextResponse.json({ ok: false, message }, { status: errorStatus(message) });
  }
}
