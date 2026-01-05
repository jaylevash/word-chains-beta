import { notFound } from "next/navigation";
import { WordChainsApp } from "@/components/WordChainsGame";

export default async function PuzzlePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const puzzleId = Number.parseInt(id, 10);
  if (!Number.isFinite(puzzleId) || puzzleId <= 0) {
    notFound();
  }

  return <WordChainsApp initialPuzzleId={puzzleId} />;
}
