import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import {
  clampText,
  enforceJson,
  enforceOrigin,
  enforceRateLimit,
} from "@/lib/request-guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originGuard = enforceOrigin(request);
  if (originGuard) return originGuard;
  const jsonGuard = enforceJson(request);
  if (jsonGuard) return jsonGuard;
  const rateGuard = await enforceRateLimit({
    request,
    key: "bugs",
    limit: 6,
    windowSeconds: 3600,
  });
  if (rateGuard) return rateGuard;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { user_id, user_name, report, bot_trap } = payload as {
    user_id?: string;
    user_name?: string | null;
    report?: string;
    bot_trap?: string | null;
  };

  if (bot_trap && String(bot_trap).trim()) {
    return NextResponse.json({ ok: true });
  }

  if (!user_id || !report) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const trimmedReport = clampText(report, 1000);
  const trimmedName = clampText(user_name, 50);

  const { error } = await supabaseAdmin.from("bug_reports").insert({
    user_id,
    user_name: trimmedName || null,
    report: trimmedReport,
    created_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
