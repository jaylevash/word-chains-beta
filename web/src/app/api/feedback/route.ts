import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const {
    user_id,
    puzzle_row_id,
    difficulty_rating,
    creativity_rating,
    comment,
    user_name,
  } = await request.json();

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

  if (user_name) {
    await supabaseAdmin
      .from("users")
      .upsert({ id: user_id, name: user_name }, { onConflict: "id" });
  }

  const { error } = await supabaseAdmin.from("feedback").upsert(
    {
      user_id,
      puzzle_row_id: puzzleRowId,
      user_name: user_name ?? null,
      difficulty_rating,
      creativity_rating,
      comment: comment ?? null,
      submitted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,puzzle_row_id" }
  );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
