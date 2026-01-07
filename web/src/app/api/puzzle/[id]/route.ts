import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type DbPuzzle = {
  id: number;
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
  id: String(row.id),
  puzzleNumber: Number(row.id),
  mode: "archive" as const,
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

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const parsedId = Number.parseInt(id, 10);
  if (!Number.isFinite(parsedId)) {
    return NextResponse.json({ error: "Invalid puzzle id" }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from("puzzles")
    .select("*")
    .eq("id", parsedId)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ error: "Puzzle not found" }, { status: 404 });
  }

  return NextResponse.json({ puzzle: mapPuzzle(data as DbPuzzle) });
}
