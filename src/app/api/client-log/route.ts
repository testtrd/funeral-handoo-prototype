import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      level?: "info" | "warn" | "error";
      message?: string;
      details?: unknown;
    };
    const level = body.level || "info";
    const message = body.message || "Client log";
    const details = body.details || {};

    if (level === "error") {
      console.error(`[client] ${message}`, details);
    } else if (level === "warn") {
      console.warn(`[client] ${message}`, details);
    } else {
      console.info(`[client] ${message}`, details);
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[client] Failed to record client log.", error);
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
