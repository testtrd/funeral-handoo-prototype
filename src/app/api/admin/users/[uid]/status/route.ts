import { NextResponse } from "next/server";
import { setEmployeeAccountStatus } from "@/lib/firebaseAdminServer";
import type { UserAccountStatus } from "@/lib/userAccountTypes";

export const runtime = "nodejs";

function errorStatus(message: string) {
  return message.includes("権限") || message.includes("ログイン") ? 403 : 400;
}

export async function POST(request: Request, context: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await context.params;
    const body = await request.json().catch(() => ({})) as { status?: UserAccountStatus };
    const status = body.status === "inactive" ? "inactive" : "active";
    const user = await setEmployeeAccountStatus(request, uid, status);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "アカウント状態の変更に失敗しました。";
    console.error("[api/admin/users/status] update failed.", error);
    return NextResponse.json({ ok: false, message }, { status: errorStatus(message) });
  }
}
