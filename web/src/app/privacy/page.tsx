import Link from "next/link";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-amber-50 px-4 py-10 text-slate-900 sm:px-6">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
              Privacy
            </p>
            <h1 className="text-3xl font-semibold">Word Chains</h1>
          </div>
          <Link
            href="/"
            className="rounded-full border border-slate-300 px-3 py-1 text-sm font-semibold transition hover:border-slate-500"
          >
            Back to game
          </Link>
        </div>

        <div className="rounded-2xl bg-white p-6 text-sm text-slate-700 shadow-sm ring-1 ring-slate-100">
          <p>
            Word Chains collects minimal data to improve the puzzle experience.
          </p>
          <ul className="mt-4 list-disc space-y-2 pl-5">
            <li>Gameplay stats (wins, attempts, time) tied to a random device ID.</li>
            <li>Optional feedback you submit (name, ratings, comments).</li>
            <li>Basic analytics for page views and in-game events.</li>
          </ul>
          <p className="mt-4">
            We do not sell personal data. If you want your feedback removed,
            contact us and we will delete it.
          </p>
        </div>
      </div>
    </div>
  );
}
