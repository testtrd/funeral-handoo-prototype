import { NextResponse } from "next/server";

function normalizePhone(value: string) {
  return value.replace(/[^\d+]/g, "");
}

export async function POST(request: Request) {
  const apiUrl = process.env.SMS_API_URL;
  const apiKey = process.env.SMS_API_KEY;
  const from = process.env.SMS_FROM || "Handoff";
  if (!apiUrl || !apiKey) {
    return NextResponse.json(
      { ok: false, message: "SMS送信サービスが未設定です。SMS_API_URL と SMS_API_KEY を設定してください。" },
      { status: 500 }
    );
  }

  const body = await request.json().catch(() => null) as { to?: unknown; message?: unknown } | null;
  const to = typeof body?.to === "string" ? normalizePhone(body.to) : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!to) {
    return NextResponse.json(
      { ok: false, message: "SMS送信先の電話番号を確認してください。" },
      { status: 400 }
    );
  }
  if (!message) {
    return NextResponse.json(
      { ok: false, message: "SMS本文を確認してください。" },
      { status: 400 }
    );
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ from, to, message })
  });

  const result = await response.json().catch(() => ({})) as { id?: string; message?: string; error?: string };
  if (!response.ok) {
    return NextResponse.json(
      { ok: false, message: result.message || result.error || "SMS送信に失敗しました。" },
      { status: response.status }
    );
  }

  return NextResponse.json({
    ok: true,
    message: "SMSを送信しました。",
    id: result.id || ""
  });
}
