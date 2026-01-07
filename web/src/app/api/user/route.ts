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
    key: "user",
    limit: 30,
    windowSeconds: 3600,
  });
  if (rateGuard) return rateGuard;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { user_id, name } = payload as {
    user_id?: string;
    name?: string | null;
  };

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const { error } = await supabaseAdmin
    .from("users")
    .upsert(
      { id: user_id, name: clampText(name, 50) || null },
      { onConflict: "id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
