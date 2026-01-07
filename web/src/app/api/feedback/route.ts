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
    key: "feedback",
    limit: 12,
    windowSeconds: 3600,
  });
  if (rateGuard) return rateGuard;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const {
    user_id,
    puzzle_row_id,
    difficulty_rating,
    creativity_rating,
    comment,
    user_name,
    bot_trap,
  } = payload as {
    user_id?: string;
    puzzle_row_id?: number | string;
    difficulty_rating?: number | string;
    creativity_rating?: number | string;
    comment?: string | null;
    user_name?: string | null;
    bot_trap?: string | null;
  };

  if (bot_trap && String(bot_trap).trim()) {
    return NextResponse.json({ ok: true });
  }

  if (!user_id || !puzzle_row_id || !difficulty_rating || !creativity_rating) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const puzzleRowId = Number(puzzle_row_id);
  if (!Number.isFinite(puzzleRowId)) {
    return NextResponse.json(
      { error: "puzzle_row_id must be a number" },
      { status: 400 }
    );
  }

  const ratingA = Number(difficulty_rating);
  const ratingB = Number(creativity_rating);
  if (
    !Number.isFinite(ratingA) ||
    !Number.isFinite(ratingB) ||
    ratingA < 1 ||
    ratingA > 10 ||
    ratingB < 1 ||
    ratingB > 10
  ) {
    return NextResponse.json({ error: "invalid rating" }, { status: 400 });
  }

  const trimmedName = clampText(user_name, 50);
  if (trimmedName) {
    await supabaseAdmin
      .from("users")
      .upsert({ id: user_id, name: trimmedName }, { onConflict: "id" });
  }

  const trimmedComment = clampText(comment, 500);

  const { error } = await supabaseAdmin.from("feedback").upsert(
    {
      user_id,
      puzzle_row_id: puzzleRowId,
      user_name: trimmedName || null,
      difficulty_rating: ratingA,
      creativity_rating: ratingB,
      comment: trimmedComment || null,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,puzzle_row_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
