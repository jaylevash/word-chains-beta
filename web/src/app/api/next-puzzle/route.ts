import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { seededShuffle } from "@/lib/game-utils";

export const dynamic = "force-dynamic";

type DbPuzzle = {
  puzzle_id: string;
  difficulty: "GREEN" | "BLUE" | "PURPLE";
  word_1: string;
  word_2: string;
  word_3: string;
  word_4: string;
  word_5: string;
  word_6: string;
  word_7: string;
  word_8: string;
  dummy_1: string;
  dummy_2: string;
  dummy_3: string;
  dummy_4: string;
  dummy_5: string;
  dummy_6: string;
  dummy_7: string;
  dummy_8: string;
  dummy_9: string;
  dummy_10: string;
};

const mapPuzzle = (row: DbPuzzle) => ({
  id: row.puzzle_id,
  puzzleNumber: Number.parseInt(row.puzzle_id, 10),
  mode: "daily" as const,
  difficulty: row.difficulty,
  words_1_to_8: [
    row.word_1,
    row.word_2,
    row.word_3,
    row.word_4,
    row.word_5,
    row.word_6,
    row.word_7,
    row.word_8,
  ],
  dummy_words: [
    row.dummy_1,
    row.dummy_2,
    row.dummy_3,
    row.dummy_4,
    row.dummy_5,
    row.dummy_6,
    row.dummy_7,
    row.dummy_8,
    row.dummy_9,
    row.dummy_10,
  ],
});

export async function POST(request: Request) {
  const { user_id } = await request.json();

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const { data: plays, error: playsError } = await supabaseAdmin
    .from("plays")
    .select("puzzle_id")
    .eq("user_id", user_id);

  if (playsError) {
    return NextResponse.json({ error: playsError.message }, { status: 500 });
  }

  const playedIds = new Set((plays ?? []).map((row) => row.puzzle_id));

  const { data: puzzles, error: puzzlesError } = await supabaseAdmin
    .from("puzzles")
    .select("*")
    .order("puzzle_id", { ascending: true });

  if (puzzlesError) {
    return NextResponse.json({ error: puzzlesError.message }, { status: 500 });
  }

  const shuffled = seededShuffle(puzzles ?? [], user_id);
  const next = shuffled.find(
    (puzzle) => !playedIds.has(puzzle.puzzle_id)
  ) as DbPuzzle | undefined;

  return NextResponse.json({
    puzzle: next ? mapPuzzle(next) : null,
    has_next: Boolean(next),
  });
}
