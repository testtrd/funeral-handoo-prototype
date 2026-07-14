import { NextResponse } from "next/server";
import { setEmployeeAccountStatus } from "@/lib/firebaseAdminServer";
import type { UserAccountStatus } from "@/lib/userAccountTypes";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message.includes("ログイン状態")) return 401;
  if (message.includes("権限")) return 403;
  if (message.includes("環境変数")) return 500;
  return 400;
}

export async function POST(request: Request, context: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { status?: UserAccountStatus };
    const status = body.status === "inactive" ? "inactive" : "active";
    const user = await setEmployeeAccountStatus(request, uid, status);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "アカウント状態の変更に失敗しました。";
    console.error("[api/admin/users/status] update failed.", error);
    return NextResponse.json({ ok: false, message }, { status: errorStatus(message) });
  }
}
