import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase-server";

type DailyRow = {
  date_key: string | null;
  puzzles: { id: number; difficulty: string | null } | null;
};

const dayIndexFromKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map((part) => Number(part));
  if (!year || !month || !day) return null;
  const utc = Date.UTC(year, month - 1, day);
  if (Number.isNaN(utc)) return null;
  return Math.floor(utc / 86400000);
};

const dayNumberFromKey = (dateKey: string) => {
  const launchKey = process.env.DAILY_LAUNCH_DATE?.trim();
  if (!launchKey) return null;
  const dayIndex = dayIndexFromKey(dateKey);
  const launchIndex = dayIndexFromKey(launchKey);
  if (dayIndex == null || launchIndex == null) return null;
  return Math.max(1, dayIndex - launchIndex + 1);
};

export default async function ArchivePage() {
  const { data: dailyRows, error } = await supabaseAdmin
    .from("daily_puzzles")
    .select("date_key, puzzles(id, difficulty)")
    .order("date_key", { ascending: false });

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
          <ul className="divide-y divide-slate-100" id="archive-list">
            {(dailyRows as DailyRow[] | null)?.map((row) => {
              if (!row.puzzles || !row.date_key) return null;
              const dayNumber = dayNumberFromKey(row.date_key);
              return (
              <li
                key={row.puzzles.id}
                className="flex items-center justify-between py-3"
                data-date-key={row.date_key}
              >
                <div>
                  <div className="text-sm font-semibold">
                    Word Chains #{dayNumber ?? row.puzzles.id}
                  </div>
                  <div className="text-xs uppercase tracking-wide text-slate-500">
                    {row.puzzles.difficulty ?? "Unlabeled"}
                  </div>
                </div>
                <Link
                  href={`/puzzle/${row.puzzles.id}`}
                  className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-50 transition hover:bg-slate-800"
                >
                  Play
                </Link>
              </li>
              );
            })}
          </ul>
          <script
            dangerouslySetInnerHTML={{
              __html: `
(() => {
  const list = document.getElementById("archive-list");
  if (!list) return;
  const now = new Date();
  const localKey = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const items = Array.from(list.querySelectorAll("li[data-date-key]"));
  items.forEach((item) => {
    const dateKey = item.getAttribute("data-date-key");
    if (!dateKey || dateKey >= localKey) {
      item.remove();
    }
  });
})();
              `,
            }}
          />
        </div>
      </div>
    </div>
  );
}
