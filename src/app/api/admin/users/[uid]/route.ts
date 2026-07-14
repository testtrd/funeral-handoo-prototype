import { NextResponse } from "next/server";
import { updateEmployeeAccount } from "@/lib/firebaseAdminServer";
import type { UpdateUserAccountInput } from "@/lib/userAccountTypes";

export const runtime = "nodejs";

function errorStatus(message: string) {
  if (message.includes("ログイン状態")) return 401;
  if (message.includes("権限")) return 403;
  if (message.includes("環境変数")) return 500;
  return 400;
}

export async function PATCH(request: Request, context: { params: Promise<{ uid: string }> }) {
  try {
    const { uid } = await context.params;
    const body = (await request.json().catch(() => ({}))) as UpdateUserAccountInput;
    const user = await updateEmployeeAccount(request, uid, body);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "社員情報の更新に失敗しました。";
    console.error("[api/admin/users] update failed.", error);
    return NextResponse.json({ ok: false, message }, { status: errorStatus(message) });
  }
}
