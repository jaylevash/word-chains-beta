import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user_id, puzzle_row_id, result, attempts, duration_seconds } =
    await request.json();

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

  const { error } = await supabaseAdmin
    .from("plays")
    .upsert(
      {
        user_id,
        puzzle_row_id: puzzleRowId,
        result,
        attempts,
        duration_seconds: duration_seconds ?? null,
        played_at: new Date().toISOString(),
      },
      { onConflict: "user_id,puzzle_row_id" }
    );

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
