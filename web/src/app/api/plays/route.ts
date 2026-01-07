import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import {
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
    key: "plays",
    limit: 60,
    windowSeconds: 3600,
  });
  if (rateGuard) return rateGuard;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { user_id, puzzle_row_id, result, attempts, duration_seconds, local_date } =
    payload as {
      user_id?: string;
      puzzle_row_id?: number | string;
      result?: string;
      attempts?: number | string;
      duration_seconds?: number | string | null;
      local_date?: string;
    };

  if (!user_id || !puzzle_row_id || !result || !attempts) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const puzzleRowId = Number(puzzle_row_id);
  if (!Number.isFinite(puzzleRowId)) {
    return NextResponse.json(
      { error: "puzzle_row_id must be a number" },
      { status: 400 }
    );
  }

  const attemptsValue = Number(attempts);
  if (!Number.isFinite(attemptsValue) || attemptsValue < 1 || attemptsValue > 6) {
    return NextResponse.json({ error: "invalid attempts" }, { status: 400 });
  }

  if (result !== "win" && result !== "loss") {
    return NextResponse.json({ error: "invalid result" }, { status: 400 });
  }

  const durationValue =
    duration_seconds == null ? null : Number(duration_seconds);
  if (durationValue != null && (!Number.isFinite(durationValue) || durationValue < 0)) {
    return NextResponse.json({ error: "invalid duration" }, { status: 400 });
  }

  const localDateValue =
    typeof local_date === "string" && local_date.trim()
      ? local_date.trim()
      : null;

  const { error } = await supabaseAdmin
    .from("plays")
    .upsert(
      {
        user_id,
        puzzle_row_id: puzzleRowId,
        result,
        attempts: attemptsValue,
        duration_seconds: durationValue ?? null,
        local_date: localDateValue,
        played_at: new Date().toISOString(),
      },
      { onConflict: "user_id,puzzle_row_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
