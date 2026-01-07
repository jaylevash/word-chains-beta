import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseAdmin } from "@/lib/supabase-server";

type PuzzleRow = {
  id: number;
  puzzle_id: string | null;
  difficulty: string | null;
};

type PlayRow = {
  puzzle_row_id: number | null;
  puzzle_id: string | null;
  result: string | null;
  attempts: number | null;
  duration_seconds: number | null;
  played_at: string | null;
};

type FeedbackRow = {
  puzzle_row_id: number | null;
  puzzle_id: string | null;
  difficulty_rating: number | null;
  creativity_rating: number | null;
  comment: string | null;
  user_name: string | null;
  submitted_at: string | null;
};

type Aggregates = {
  plays: number;
  wins: number;
  attemptsSum: number;
  secondsSum: number;
  feedbackCount: number;
  difficultySum: number;
  logicalnessSum: number;
  comments: Array<{ name: string; comment: string }>;
};

type DailyAggregate = {
  plays: number;
  wins: number;
  attemptsSum: number;
  secondsSum: number;
  feedbackCount: number;
  ratingSum: number;
};

const formatDuration = (seconds: number | null) => {
  if (!seconds || seconds <= 0) return "—";
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const formatNumber = (value: number | null) => {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toFixed(1);
};

const dateKeyFromTimestamp = (value: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const getLastSevenDays = () => {
  const today = new Date();
  const base = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate())
  );
  return Array.from({ length: 7 }, (_, idx) => {
    const date = new Date(base);
    date.setUTCDate(base.getUTCDate() - (6 - idx));
    return date.toISOString().slice(0, 10);
  });
};

export default async function InsightsPage({
  searchParams,
}: {
  searchParams: Promise<{ key?: string }>;
}) {
  const { key } = await searchParams;
  const accessKey = process.env.INSIGHTS_ACCESS_KEY;
  if (!accessKey || key !== accessKey) {
    notFound();
  }

  const [puzzleRes, playsRes, feedbackRes] = await Promise.all([
    supabaseAdmin
      .from("puzzles")
      .select("id, puzzle_id, difficulty")
      .order("id", { ascending: true }),
    supabaseAdmin
      .from("plays")
      .select(
        "puzzle_row_id, puzzle_id, result, attempts, duration_seconds, played_at"
      ),
    supabaseAdmin
      .from("feedback")
      .select(
        "puzzle_row_id, puzzle_id, difficulty_rating, creativity_rating, comment, user_name, submitted_at"
      ),
  ]);

  if (puzzleRes.error || playsRes.error || feedbackRes.error) {
    return (
      <div className="min-h-screen bg-amber-50 px-4 py-6 text-slate-900 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <h1 className="text-2xl font-semibold">Insights unavailable</h1>
          <p className="text-sm text-slate-600">
            {puzzleRes.error?.message ||
              playsRes.error?.message ||
              feedbackRes.error?.message ||
              "Unknown error"}
          </p>
          <Link
            href="/"
            className="w-fit rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold transition hover:border-slate-500"
          >
            Back to game
          </Link>
        </div>
      </div>
    );
  }

  const puzzles = (puzzleRes.data ?? []) as PuzzleRow[];
  const plays = (playsRes.data ?? []) as PlayRow[];
  const feedback = (feedbackRes.data ?? []) as FeedbackRow[];

  const puzzleById = new Map<number, PuzzleRow>();
  const puzzleByLegacyId = new Map<string, PuzzleRow>();
  puzzles.forEach((puzzle) => {
    puzzleById.set(Number(puzzle.id), puzzle);
    if (puzzle.puzzle_id) {
      puzzleByLegacyId.set(puzzle.puzzle_id, puzzle);
    }
  });

  const aggregates = new Map<number, Aggregates>();
  const dailyAggregates = new Map<string, DailyAggregate>();
  const ensureAgg = (id: number) => {
    if (!aggregates.has(id)) {
      aggregates.set(id, {
        plays: 0,
        wins: 0,
        attemptsSum: 0,
        secondsSum: 0,
        feedbackCount: 0,
        difficultySum: 0,
        logicalnessSum: 0,
        comments: [],
      });
    }
    return aggregates.get(id)!;
  };

  const ensureDaily = (key: string) => {
    if (!dailyAggregates.has(key)) {
      dailyAggregates.set(key, {
        plays: 0,
        wins: 0,
        attemptsSum: 0,
        secondsSum: 0,
        feedbackCount: 0,
        ratingSum: 0,
      });
    }
    return dailyAggregates.get(key)!;
  };

  const resolvePuzzleId = (row: {
    puzzle_row_id: number | null;
    puzzle_id: string | null;
  }) => {
    if (row.puzzle_row_id != null) return Number(row.puzzle_row_id);
    if (row.puzzle_id) {
      const legacy = puzzleByLegacyId.get(row.puzzle_id);
      if (legacy) return Number(legacy.id);
    }
    return null;
  };

  plays.forEach((row) => {
    const resolved = resolvePuzzleId(row);
    if (resolved == null) return;
    const agg = ensureAgg(resolved);
    agg.plays += 1;
    if (row.result === "win") agg.wins += 1;
    agg.attemptsSum += row.attempts ?? 0;
    agg.secondsSum += row.duration_seconds ?? 0;

    const dayKey = dateKeyFromTimestamp(row.played_at);
    if (dayKey) {
      const daily = ensureDaily(dayKey);
      daily.plays += 1;
      if (row.result === "win") daily.wins += 1;
      daily.attemptsSum += row.attempts ?? 0;
      daily.secondsSum += row.duration_seconds ?? 0;
    }
  });

  feedback.forEach((row) => {
    const resolved = resolvePuzzleId(row);
    if (resolved == null) return;
    const agg = ensureAgg(resolved);
    agg.feedbackCount += 1;
    agg.difficultySum += row.difficulty_rating ?? 0;
    agg.logicalnessSum += row.creativity_rating ?? 0;
    if (row.comment && row.comment.trim()) {
      const name = row.user_name?.trim() || "Anonymous";
      agg.comments.push({ name, comment: row.comment.trim() });
    }

    const dayKey = dateKeyFromTimestamp(row.submitted_at);
    if (dayKey) {
      const daily = ensureDaily(dayKey);
      daily.feedbackCount += 1;
      daily.ratingSum += row.difficulty_rating ?? 0;
    }
  });

  const dailyKeys = getLastSevenDays();
  const dailyRows = dailyKeys.map((key) => {
    const daily = dailyAggregates.get(key) ?? {
      plays: 0,
      wins: 0,
      attemptsSum: 0,
      secondsSum: 0,
      feedbackCount: 0,
      ratingSum: 0,
    };
    const winRate =
      daily.plays > 0 ? Math.round((daily.wins / daily.plays) * 100) : null;
    const avgAttempts =
      daily.plays > 0 ? daily.attemptsSum / daily.plays : null;
    const avgSeconds =
      daily.plays > 0 ? Math.round(daily.secondsSum / daily.plays) : null;
    const avgRating =
      daily.feedbackCount > 0
        ? daily.ratingSum / daily.feedbackCount
        : null;
    return {
      key,
      plays: daily.plays,
      winRate,
      avgAttempts,
      avgSeconds,
      avgRating,
    };
  });

  return (
    <div className="min-h-screen bg-amber-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
              Insights
            </p>
            <h1 className="text-3xl font-semibold">Word Chains</h1>
            <p className="mt-1 text-sm text-slate-600">
              Internal puzzle quality dashboard.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold transition hover:border-slate-500"
          >
            Back to game
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {puzzles.map((puzzle) => {
            const agg = aggregates.get(Number(puzzle.id));
            const playsCount = agg?.plays ?? 0;
            const winRate =
              playsCount > 0 ? Math.round((agg!.wins / playsCount) * 100) : null;
            const avgAttempts =
              playsCount > 0 ? agg!.attemptsSum / playsCount : null;
            const avgSeconds =
              playsCount > 0 ? Math.round(agg!.secondsSum / playsCount) : null;
            const avgRating =
              agg && agg.feedbackCount > 0
                ? agg.difficultySum / agg.feedbackCount
                : null;
            const label = puzzle.puzzle_id ?? String(puzzle.id);
            const comments = agg?.comments.slice(-2) ?? [];

            return (
              <div
                key={puzzle.id}
                className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="text-lg font-semibold">Puzzle #{label}</div>
                    <div className="text-xs uppercase tracking-wide text-slate-500">
                      {puzzle.difficulty ?? "Unlabeled"}
                    </div>
                  </div>
                  <Link
                    href={`/puzzle/${puzzle.id}`}
                    className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-50 transition hover:bg-slate-800"
                  >
                    Play
                  </Link>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 text-sm text-slate-700">
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase text-slate-500">Plays</div>
                    <div className="text-lg font-semibold">{playsCount}</div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase text-slate-500">
                      Win Rate
                    </div>
                    <div className="text-lg font-semibold">
                      {winRate == null ? "—" : `${winRate}%`}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase text-slate-500">
                      Avg Attempts
                    </div>
                    <div className="text-lg font-semibold">
                      {formatNumber(avgAttempts)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase text-slate-500">
                      Avg Time
                    </div>
                    <div className="text-lg font-semibold">
                      {formatDuration(avgSeconds)}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-50 px-3 py-2">
                    <div className="text-xs uppercase text-slate-500">
                      Rating
                    </div>
                    <div className="text-lg font-semibold">
                      {formatNumber(avgRating)}
                    </div>
                  </div>
                </div>

                <div className="mt-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Recent comments
                  </div>
                  {comments.length ? (
                    <div className="mt-2 space-y-2 text-sm text-slate-600">
                      {comments.map((entry, idx) => (
                        <div key={`${entry.name}-${idx}`}>
                          <span className="font-semibold text-slate-700">
                            {entry.name}:
                          </span>{" "}
                          {entry.comment}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-2 text-sm text-slate-400">
                      No feedback yet.
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Daily Snapshot (UTC)
              </div>
              <div className="text-lg font-semibold text-slate-900">
                Last 7 days
              </div>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm text-slate-700">
              <thead className="text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Plays</th>
                  <th className="py-2 pr-4">Win Rate</th>
                  <th className="py-2 pr-4">Avg Attempts</th>
                  <th className="py-2 pr-4">Avg Time</th>
                  <th className="py-2 pr-4">Rating</th>
                </tr>
              </thead>
              <tbody>
                {dailyRows.map((row) => (
                  <tr key={row.key} className="border-t border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-900">
                      {row.key}
                    </td>
                    <td className="py-2 pr-4">{row.plays}</td>
                    <td className="py-2 pr-4">
                      {row.winRate == null ? "—" : `${row.winRate}%`}
                    </td>
                    <td className="py-2 pr-4">{formatNumber(row.avgAttempts)}</td>
                    <td className="py-2 pr-4">{formatDuration(row.avgSeconds)}</td>
                    <td className="py-2 pr-4">{formatNumber(row.avgRating)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
