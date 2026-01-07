import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import {
  enforceJson,
  enforceOrigin,
  enforceRateLimit,
} from "@/lib/request-guard";

export const dynamic = "force-dynamic";

type PlayRow = {
  result: string | null;
  attempts: number | null;
  played_at: string | null;
  local_date: string | null;
};

export async function POST(request: Request) {
  const originGuard = enforceOrigin(request);
  if (originGuard) return originGuard;
  const jsonGuard = enforceJson(request);
  if (jsonGuard) return jsonGuard;
  const rateGuard = await enforceRateLimit({
    request,
    key: "puzzle_stats",
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

  const { puzzle_row_id, local_date } = payload as {
    puzzle_row_id?: number | string;
    local_date?: string;
  };
  if (!puzzle_row_id) {
    return NextResponse.json({ error: "missing puzzle_row_id" }, { status: 400 });
  }

  const puzzleRowId = Number(puzzle_row_id);
  if (!Number.isFinite(puzzleRowId)) {
    return NextResponse.json(
      { error: "puzzle_row_id must be a number" },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("plays")
    .select("result, attempts, played_at, local_date")
    .eq("puzzle_row_id", puzzleRowId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const counts = { "1": 0, "2": 0, "3": 0, "4": 0, loss: 0 };
  const targetDate =
    typeof local_date === "string" && local_date.trim()
      ? local_date.trim()
      : null;

  (data as PlayRow[] | null)?.forEach((row) => {
    if (targetDate) {
      const playedKey = row.local_date?.trim() || null;
      if (!playedKey || playedKey !== targetDate) {
        return;
      }
    }
    if (row.result === "loss") {
      counts.loss += 1;
      return;
    }
    const attempts = Number(row.attempts);
    if (attempts >= 1 && attempts <= 4) {
      counts[String(attempts) as "1" | "2" | "3" | "4"] += 1;
    }
  });

  const total =
    counts["1"] + counts["2"] + counts["3"] + counts["4"] + counts.loss;

  return NextResponse.json({
    total,
    counts,
  });
}
