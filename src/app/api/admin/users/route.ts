import { NextResponse } from "next/server";
import { createEmployeeAccount, listEmployeeAccounts } from "@/lib/firebaseAdminServer";
import type { CreateUserAccountInput } from "@/lib/userAccountTypes";

export const runtime = "nodejs";

function errorStatus(message: string) {
  return message.includes("権限") || message.includes("ログイン") ? 403 : 400;
}

export async function GET(request: Request) {
  try {
    const users = await listEmployeeAccounts(request);
    return NextResponse.json({ ok: true, users });
  } catch (error) {
    const message = error instanceof Error ? error.message : "社員一覧の取得に失敗しました。";
    console.error("[api/admin/users] list failed.", error);
    return NextResponse.json({ ok: false, message }, { status: errorStatus(message) });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({})) as CreateUserAccountInput;
    const user = await createEmployeeAccount(request, body);
    return NextResponse.json({ ok: true, user });
  } catch (error) {
    const message = error instanceof Error ? error.message : "社員アカウントの登録に失敗しました。";
    console.error("[api/admin/users] create failed.", error);
    return NextResponse.json({ ok: false, message }, { status: errorStatus(message) });
  }
}
