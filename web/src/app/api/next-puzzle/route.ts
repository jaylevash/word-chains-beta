import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { seededShuffle } from "@/lib/game-utils";

export const dynamic = "force-dynamic";

type DbPuzzle = {
  id: number;
  puzzle_id: string | null;
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

type PlayRow = {
  puzzle_row_id: number | null;
  puzzle_id: string | null;
};

const mapPuzzle = (row: DbPuzzle) => {
  const rowId = Number(row.id);
  return {
    id: String(rowId),
    puzzleNumber: rowId,
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
  };
};

export async function POST(request: Request) {
  const { user_id } = await request.json();

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const { data: plays, error: playsError } = await supabaseAdmin
    .from("plays")
    .select("puzzle_row_id, puzzle_id")
    .eq("user_id", user_id);

  if (playsError) {
    return NextResponse.json({ error: playsError.message }, { status: 500 });
  }

  const playedIds = new Set<number>();
  (plays as PlayRow[] | null)?.forEach((row) => {
    if (row.puzzle_row_id != null) {
      playedIds.add(Number(row.puzzle_row_id));
      return;
    }
    if (row.puzzle_id) {
      const parsed = Number.parseInt(row.puzzle_id, 10);
      if (!Number.isNaN(parsed)) {
        playedIds.add(parsed);
      }
    }
  });

  const { data: puzzles, error: puzzlesError } = await supabaseAdmin
    .from("puzzles")
    .select("*")
    .order("id", { ascending: true });

  if (puzzlesError) {
    return NextResponse.json({ error: puzzlesError.message }, { status: 500 });
  }

  const shuffled = seededShuffle(puzzles ?? [], user_id);
  const next = shuffled.find(
    (puzzle) => !playedIds.has(Number(puzzle.id))
  ) as DbPuzzle | undefined;

  return NextResponse.json({
    puzzle: next ? mapPuzzle(next) : null,
    has_next: Boolean(next),
  });
}
