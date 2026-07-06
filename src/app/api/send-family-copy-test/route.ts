import { NextResponse } from "next/server";

const resendEndpoint = "https://api.resend.com/emails";

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, message: "RESEND_API_KEY が設定されていません。" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null) as { to?: unknown } | null;
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  if (!isValidEmail(to)) {
    return NextResponse.json(
      { ok: false, message: "親族控えの送信先メールアドレスを確認してください。" },
      { status: 400 }
    );
  }

  const response = await fetch(resendEndpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: "業務引継書アプリ <onboarding@resend.dev>",
      to,
      subject: "親族控え送付テスト",
      text: "親族控え送付のテストメールです。"
    })
  });

  const result = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: string };
  if (!response.ok) {
    return NextResponse.json(
      { ok: false, message: result.message || result.error || "親族控え送付テストに失敗しました。" },
      { status: response.status }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "親族控え送付テストメールを送信しました。",
    id: result.id || ""
  });
}
