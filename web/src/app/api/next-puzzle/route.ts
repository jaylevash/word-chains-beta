import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import { seededShuffle } from "@/lib/game-utils";
import {
  enforceJson,
  enforceOrigin,
  enforceRateLimit,
} from "@/lib/request-guard";

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

type PlayRow = {
  puzzle_row_id: number | null;
};

const dayIndexFromKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const utc = Date.UTC(year, month - 1, day);
  if (Number.isNaN(utc)) return null;
  return Math.floor(utc / 86400000);
};

const dayNumberFromKey = (dateKey: string) => {
  const dayIndex = dayIndexFromKey(dateKey);
  if (dayIndex == null) return null;
  const launchKey = process.env.DAILY_LAUNCH_DATE?.trim();
  if (!launchKey) return null;
  const launchIndex = dayIndexFromKey(launchKey);
  if (launchIndex == null) return null;
  return Math.max(1, dayIndex - launchIndex + 1);
};

const mapPuzzle = (row: DbPuzzle, puzzleNumberOverride?: number | null) => {
  const rowId = Number(row.id);
  return {
    id: String(rowId),
    puzzleNumber: puzzleNumberOverride ?? rowId,
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
  const originGuard = enforceOrigin(request);
  if (originGuard) return originGuard;
  const jsonGuard = enforceJson(request);
  if (jsonGuard) return jsonGuard;
  const rateGuard = await enforceRateLimit({
    request,
    key: "next_puzzle",
    limit: 120,
    windowSeconds: 3600,
  });
  if (rateGuard) return rateGuard;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const { user_id, local_date } = payload as {
    user_id?: string;
    local_date?: string;
  };

  if (!user_id) {
    return NextResponse.json({ error: "user_id required" }, { status: 400 });
  }

  const { data: puzzles, error: puzzlesError } = await supabaseAdmin
    .from("puzzles")
    .select("*")
    .order("id", { ascending: true });

  if (puzzlesError) {
    return NextResponse.json({ error: puzzlesError.message }, { status: 500 });
  }

  if (typeof local_date === "string" && local_date.trim()) {
    const dateKey = local_date.trim();
    const dayIndex = dayIndexFromKey(dateKey);
    const dayNumber = dayNumberFromKey(dateKey);
    const puzzleList = puzzles ?? [];
    const daily =
      dayIndex == null || puzzleList.length === 0
        ? (seededShuffle(puzzleList, dateKey)[0] as DbPuzzle | undefined)
        : (puzzleList[dayIndex % puzzleList.length] as DbPuzzle | undefined);
    return NextResponse.json({
      puzzle: daily ? mapPuzzle(daily, dayNumber) : null,
      has_next: false,
    });
  }

  const { data: plays, error: playsError } = await supabaseAdmin
    .from("plays")
    .select("puzzle_row_id")
    .eq("user_id", user_id);

  if (playsError) {
    return NextResponse.json({ error: playsError.message }, { status: 500 });
  }

  const playedIds = new Set<number>();
  (plays as PlayRow[] | null)?.forEach((row) => {
    if (row.puzzle_row_id != null) {
      playedIds.add(Number(row.puzzle_row_id));
    }
  });

  const shuffled = seededShuffle(puzzles ?? [], user_id);
  const next = shuffled.find(
    (puzzle) => !playedIds.has(Number(puzzle.id))
  ) as DbPuzzle | undefined;

  return NextResponse.json({
    puzzle: next ? mapPuzzle(next) : null,
    has_next: Boolean(next),
  });
}
