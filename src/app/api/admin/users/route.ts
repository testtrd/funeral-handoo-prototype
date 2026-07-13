import { NextResponse } from "next/server";
import { createEmployeeAccount } from "@/lib/firebaseAdminServer";
import type { CreateUserAccountInput } from "@/lib/userAccountTypes";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as CreateUserAccountInput;
    const user = await createEmployeeAccount(request, body);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "社員アカウントの登録に失敗しました。";
    console.error("[api/admin/users] create failed.", error);
    const status = message.includes("権限") || message.includes("ログイン") ? 403 : 400;
    return NextResponse.json({ ok: false, message }, { status });
  }
}
