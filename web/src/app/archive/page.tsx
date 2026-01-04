import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";

export default async function ArchivePage() {
  const { data: puzzles, error } = await supabaseAdmin
    .from("puzzles")
    .select("id, puzzle_id, difficulty")
    .order("id", { ascending: true });

  if (error) {
    return (
      <div className="min-h-screen bg-amber-50 px-4 py-6 text-slate-900 sm:px-6">
        <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
          <h1 className="text-2xl font-semibold">Archive unavailable</h1>
          <p className="text-sm text-slate-600">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-amber-50 px-4 py-6 text-slate-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">
              Word Chains
            </p>
            <h1 className="text-3xl font-semibold">All Puzzles</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold transition hover:border-slate-500"
          >
            Back to today
          </Link>
        </div>

        <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 sm:p-6">
          <ul className="divide-y divide-slate-100">
            {(puzzles ?? []).map((puzzle) => {
              const label = puzzle.puzzle_id ?? String(puzzle.id);
              return (
              <li
                key={puzzle.id}
                className="flex items-center justify-between py-3"
              >
                <div>
                  <div className="text-sm font-semibold">
                    Word Chains #{label}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {puzzle.difficulty ?? "Unlabeled"}
                  </div>
                </div>
                <Link
                  href="/"
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-50 transition hover:bg-slate-800"
                >
                  Play
                </Link>
              </li>
              );
            })}
          </ul>
        </div>
      </div>
    </div>
  );
}
