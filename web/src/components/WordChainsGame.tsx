"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Puzzle } from "@/lib/puzzles";
import {
  TileColor,
  bestColorUpgrade,
  formatShareText,
  seededShuffle,
  validateGuess,
} from "@/lib/game-utils";

type GameResult = "playing" | "win" | "loss";

const editableSlots = [1, 2, 3, 4, 5, 6];
const flipDurationMs = 900;
const STORAGE_USER_ID = "wordchains:user-id:v1";
const STORAGE_USER_NAME = "wordchains:user-name:v1";

const buildInitialAttempts = (puzzle: Puzzle) => {
  const base = [
    puzzle.words_1_to_8[0],
    "",
    "",
    "",
    "",
    "",
    "",
    puzzle.words_1_to_8[7],
  ];
  return [0, 1, 2, 3].map(() => [...base]);
};

const emptyColors = () => Array<TileColor>(8).fill("blank");

const createUserId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `user_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

export function WordChainsGame({
  puzzle,
  userId,
  hasNextPuzzle = null,
  onNextPuzzle,
  onPuzzleComplete,
}: {
  puzzle: Puzzle;
  userId: string;
  hasNextPuzzle?: boolean | null;
  onNextPuzzle?: () => void;
  onPuzzleComplete?: (payload: {
    puzzleRowId: number;
    result: "win" | "loss";
    attempts: number;
    durationSeconds: number;
  }) => void;
}) {
  const [difficultyRating, setDifficultyRating] = useState(5);
  const [creativityRating, setCreativityRating] = useState(5);
  const [comment, setComment] = useState("");
  const [name, setName] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STORAGE_USER_NAME) ?? "";
  });
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const shareTimeoutRef = useRef<number | null>(null);
  const puzzleRowId = Number.parseInt(puzzle.id, 10);
  const solution = useMemo(
    () => puzzle.words_1_to_8.slice(1, 7),
    [puzzle.words_1_to_8]
  );

  const bankWords = useMemo(
    () => seededShuffle([...solution, ...puzzle.dummy_words], puzzle.id),
    [puzzle, solution]
  );

  const [attempts, setAttempts] = useState(() => buildInitialAttempts(puzzle));
  const [colorsByAttempt, setColorsByAttempt] = useState<TileColor[][]>([
    emptyColors(),
    emptyColors(),
    emptyColors(),
    emptyColors(),
  ]);
  const [currentAttempt, setCurrentAttempt] = useState(0);
  const [activeSlot, setActiveSlot] = useState(1);
  const [heldWord, setHeldWord] = useState<string | null>(null);
  const [bestColors, setBestColors] = useState<Record<string, TileColor>>({});
  const [shareRows, setShareRows] = useState<TileColor[][]>([]);
  const [guessOutcomes, setGuessOutcomes] = useState<boolean[]>([]);
  const [showHelp, setShowHelp] = useState(false);
  const [isResultsOpen, setIsResultsOpen] = useState(false);
  const [result, setResult] = useState<GameResult>("playing");
  const [isAnimating, setIsAnimating] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [shareMessage, setShareMessage] = useState<string | null>(null);

  const activeAttemptSlots = attempts[currentAttempt] ?? attempts[0];
  const activeEditableFilled = editableSlots.every(
    (idx) => activeAttemptSlots[idx]
  );

  const disabledBecauseDone = result !== "playing" || isAnimating;

  const handleSelectBankWord = (word: string) => {
    if (disabledBecauseDone) return;
    const isAlreadyHeld = heldWord === word;
    if (isAlreadyHeld) {
      setHeldWord(null);
      return;
    }
    const usedInAttempt = activeAttemptSlots.includes(word);
    if (usedInAttempt) {
      setStatusNote("Word already placed in this guess.");
      return;
    }
    setHeldWord(word);
    setStatusNote(null);
  };

  const findNextEmptySlot = (attemptIndex: number) => {
    const attempt = attempts[attemptIndex] ?? attempts[0];
    const next = editableSlots.find((idx) => !attempt[idx]);
    return next ?? 1;
  };

  const handleSlotClick = (slotIndex: number) => {
    if (slotIndex === 0 || slotIndex === 7) return;
    if (disabledBecauseDone) return;
    if (heldWord) {
      placeHeldWord(slotIndex);
      return;
    }
    if (attempts[currentAttempt][slotIndex]) {
      removeWordFromSlot(slotIndex);
      return;
    }
    setActiveSlot(slotIndex);
  };

  const placeHeldWord = (slotIndex: number) => {
    if (!heldWord) return;
    if (attempts[currentAttempt].includes(heldWord)) {
      setStatusNote("Word already placed in this guess.");
      return;
    }
    setAttempts((prev) => {
      const updated = prev.map((attempt, idx) => {
        if (idx !== currentAttempt) return attempt;
        const nextAttempt = [...attempt];
        nextAttempt[slotIndex] = heldWord;
        return nextAttempt;
      });
      return updated;
    });
    setHeldWord(null);
    const nextSlot = findNextEmptySlot(currentAttempt);
    setActiveSlot(nextSlot);
    setStatusNote(null);
  };

  const removeWordFromSlot = (slotIndex: number) => {
    setAttempts((prev) => {
      const updated = prev.map((attempt, idx) => {
        if (idx !== currentAttempt) return attempt;
        const nextAttempt = [...attempt];
        nextAttempt[slotIndex] = "";
        return nextAttempt;
      });
      return updated;
    });
    setActiveSlot(slotIndex);
  };

  const applyBestColors = (guessWords: string[], guessColors: TileColor[]) => {
    setBestColors((prev) => {
      const next = { ...prev };
      guessWords.forEach((word, i) => {
        next[word] = bestColorUpgrade(next[word] ?? "blank", guessColors[i]);
      });
      return next;
    });
  };

  const handleSubmit = () => {
    if (disabledBecauseDone || !activeEditableFilled) return;

    const guessWords = editableSlots.map((idx) => activeAttemptSlots[idx]);
    const { colors: validationColors, allGreen } = validateGuess(
      solution,
      guessWords
    );

    const nextColorsByAttempt = colorsByAttempt.map((colors, idx) =>
      idx === currentAttempt ? [...colors] : colors
    );
    editableSlots.forEach((slotIdx, i) => {
      nextColorsByAttempt[currentAttempt][slotIdx] = validationColors[i];
    });
    nextColorsByAttempt[currentAttempt][0] = "green";
    nextColorsByAttempt[currentAttempt][7] = "green";

    const shareRow: TileColor[] = [
      "green",
      ...validationColors,
      "green",
    ];

    const attemptsUsed = shareRows.length + 1;
    const durationSeconds = Math.max(
      0,
      Math.round((Date.now() - startTimeRef.current) / 1000)
    );
    setColorsByAttempt(nextColorsByAttempt);
    setShareRows((prev) => [...prev, shareRow]);
    setGuessOutcomes((prev) => [...prev, allGreen]);
    applyBestColors(guessWords, validationColors);
    setIsAnimating(true);
    setTimeout(() => {
      setIsAnimating(false);
    }, flipDurationMs);

    if (allGreen) {
      setResult("win");
      onPuzzleComplete?.({
        puzzleRowId,
        result: "win",
        attempts: attemptsUsed,
        durationSeconds,
      });
      return;
    }

    if (currentAttempt === attempts.length - 1) {
      setResult("loss");
      onPuzzleComplete?.({
        puzzleRowId,
        result: "loss",
        attempts: attemptsUsed,
        durationSeconds,
      });
      return;
    }

    setCurrentAttempt((prev) => prev + 1);
    setActiveSlot(findNextEmptySlot(currentAttempt + 1));
    setHeldWord(null);
  };

  const copyShare = async () => {
    if (!shareRows.length) return;
    try {
      const shareText = formatShareText(puzzle.puzzleNumber, shareRows);
      const shareUrl = "https://word-chains-beta.vercel.app";
      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share({
            title: `Word Chains #${puzzle.puzzleNumber}`,
            text: shareText,
            url: shareUrl,
          });
          setShareMessage("Share sheet opened — send it to a friend!");
          if (shareTimeoutRef.current) {
            window.clearTimeout(shareTimeoutRef.current);
          }
          shareTimeoutRef.current = window.setTimeout(() => {
            setShareMessage(null);
            shareTimeoutRef.current = null;
          }, 2500);
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === "AbortError") {
            return;
          }
        }
      }
      await navigator.clipboard.writeText(shareText);
      setStatusNote("Copied results to clipboard.");
      setShareMessage("Copied! Share your chain with friends or family.");
      if (shareTimeoutRef.current) {
        window.clearTimeout(shareTimeoutRef.current);
      }
      shareTimeoutRef.current = window.setTimeout(() => {
        setShareMessage(null);
        shareTimeoutRef.current = null;
      }, 2500);
    } catch {
      setStatusNote("Unable to copy. Try selecting manually.");
      setShareMessage("Could not copy yet. Try again in a second.");
    }
  };

  const saveFeedback = async () => {
    if (feedbackSaving) return;
    if (!userId) {
      setStatusNote("Missing user id.");
      return;
    }
    setFeedbackSaving(true);
    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          user_name: name.trim() || null,
          puzzle_row_id: puzzleRowId,
          difficulty_rating: difficultyRating,
          creativity_rating: creativityRating,
          comment: comment.trim() || null,
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || "Unable to save feedback.");
      }
      if (name.trim()) {
        localStorage.setItem(STORAGE_USER_NAME, name.trim());
      }
      setFeedbackSaved(true);
      setStatusNote("Feedback saved. Thank you!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save feedback.";
      setStatusNote(message);
    } finally {
      setFeedbackSaving(false);
    }
  };

  const bankTileState = bankWords.map((word) => {
    const usedInAttempt = activeAttemptSlots.includes(word);
    return {
      word,
      bestColor: bestColors[word] ?? "blank",
      disabled: usedInAttempt || disabledBecauseDone,
      usedInAttempt,
    };
  });

  const submittedCount = shareRows.length;
  const fixedRevealed = colorsByAttempt.some((attempt) => attempt[0] === "green");
  const showResultsModal = result !== "playing" && isResultsOpen;
  const canAdvance = hasNextPuzzle === true && Boolean(onNextPuzzle);

  const successTone =
    "bg-emerald-100 text-emerald-900 border-emerald-500";

  useEffect(() => {
    if (result !== "playing") {
      setIsResultsOpen(true);
    }
  }, [result]);

  useEffect(() => {
    return () => {
      if (shareTimeoutRef.current) {
        window.clearTimeout(shareTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex min-h-[100svh] flex-col bg-amber-50 text-slate-900">
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2 sm:px-6 sm:py-4">
        <div className="justify-self-start text-xs font-semibold text-slate-500 sm:text-sm">
          Puzzle #{puzzle.puzzleNumber}
        </div>
        <h1 className="justify-self-center bg-gradient-to-r from-amber-600 via-orange-500 to-rose-500 bg-clip-text text-xl font-semibold text-transparent sm:text-3xl">
          Word Chains
        </h1>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          aria-label="How to play"
          className="justify-self-end flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700 sm:h-8 sm:w-8 sm:text-sm"
        >
          ?
        </button>
      </header>

      <main className="mx-auto flex min-h-0 w-full max-w-4xl flex-1 flex-col items-center gap-1.5 px-3 pb-[calc(env(safe-area-inset-bottom)+0.5rem)] sm:gap-2 sm:px-6 sm:pb-8">
        <section className="flex w-full flex-col gap-1 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-100 sm:gap-3 sm:p-4">
          <div className="flex items-center justify-center gap-3">
            {[0, 1, 2, 3].map((idx) => {
              const isSubmitted = idx < submittedCount;
              const isSolved = guessOutcomes[idx];
              const tone = isSubmitted
                ? isSolved
                  ? "bg-emerald-100 border-emerald-500 text-emerald-900"
                  : "bg-rose-100 border-rose-500 text-rose-900"
                : "bg-white border-slate-200 text-slate-500";
              return (
                <div
                  key={idx}
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-[9px] font-semibold sm:h-9 sm:w-9 sm:text-xs ${tone}`}
                >
                  {idx + 1}
                </div>
              );
            })}
          </div>
          <div className="flex items-center justify-end">
            {statusNote ? (
              <div className="text-xs font-medium text-amber-600">
                {statusNote}
              </div>
            ) : null}
          </div>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(64px,1fr))] gap-1 sm:gap-2">
            {attempts.map((attempt, attemptIdx) => {
              if (attemptIdx > currentAttempt) return null;
              const isActive = attemptIdx === currentAttempt && result === "playing";
              const attemptColors = colorsByAttempt[attemptIdx];
              return (
                <div
                  key={attemptIdx}
                  className="flex flex-col gap-1 rounded-xl bg-slate-50 p-2 sm:gap-2"
                >
                  <div className="hidden text-[10px] font-semibold uppercase tracking-wide text-slate-500 sm:block sm:text-xs">
                    {isActive ? "Active" : "Locked"}
                  </div>
                  {attempt.map((word, slotIdx) => {
                    const isEditable = editableSlots.includes(slotIdx);
                    const slotColor =
                      fixedRevealed && (slotIdx === 0 || slotIdx === 7)
                        ? "green"
                        : attemptColors?.[slotIdx] ?? "blank";
                    const isSlotActive = isActive && activeSlot === slotIdx;
                    const displayWord = word;
                    const baseColor =
                      slotColor === "green"
                        ? "bg-emerald-100 border-emerald-500 text-emerald-900"
                        : slotColor === "yellow"
                          ? "bg-amber-100 border-amber-500 text-amber-900"
                          : slotColor === "red"
                            ? "bg-rose-100 border-rose-500 text-rose-900"
                            : "bg-white border-slate-200 text-slate-900";
                    return (
                      <button
                        key={slotIdx}
                        type="button"
                        onClick={() => handleSlotClick(slotIdx)}
                        className={`flex h-[clamp(32px,3.9vh,40px)] items-center justify-center rounded-lg border text-[10px] font-semibold uppercase tracking-wide transition focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 sm:text-xs ${
                          isSlotActive ? "ring-2 ring-slate-400 ring-offset-2" : ""
                        } ${!isEditable ? "cursor-default" : "cursor-pointer"} ${baseColor}`}
                        disabled={!isEditable || disabledBecauseDone || !isActive}
                        style={{
                          animation:
                            slotColor !== "blank" ? "flip 0.5s ease-in-out" : undefined,
                          animationDelay:
                            slotColor !== "blank" ? `${slotIdx * 80}ms` : undefined,
                        }}
                      >
                        {displayWord || (isEditable ? "" : word)}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-0.5">
            {result !== "playing" ? (
              <button
                type="button"
                onClick={() => setIsResultsOpen(true)}
                className="rounded-full border border-slate-300 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-400 sm:px-5 sm:py-2 sm:text-sm"
              >
                View Results
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSubmit}
                disabled={!activeEditableFilled || disabledBecauseDone}
                className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition sm:px-5 sm:py-2 sm:text-sm ${
                  !activeEditableFilled || disabledBecauseDone
                    ? "cursor-not-allowed bg-slate-200 text-slate-400"
                    : "bg-slate-900 text-amber-50 hover:bg-slate-800"
                }`}
              >
                Submit Guess
              </button>
            )}
          </div>
        </section>

        <section className="flex w-full min-h-0 flex-1 flex-col gap-1 rounded-2xl bg-white p-1.5 shadow-sm ring-1 ring-slate-100 sm:gap-3 sm:p-4">
          <div className="flex flex-col items-center gap-1 text-center">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500 sm:text-sm">
              Word Bank
            </h2>
            <p className="hidden text-xs text-slate-500 sm:block">
              Tap to hold, tap slot to place. Tap placed word to remove.
            </p>
          </div>
          <div className="grid flex-1 grid-cols-4 grid-rows-4 gap-1.5 sm:gap-2">
            {bankTileState.map((tile) => {
              const tone =
                tile.bestColor === "green"
                  ? "bg-emerald-100 border-emerald-600 text-emerald-900"
                  : tile.bestColor === "yellow"
                    ? "bg-amber-100 border-amber-600 text-amber-900"
                    : tile.bestColor === "red"
                      ? "bg-rose-100 border-rose-600 text-rose-900"
                      : "bg-slate-50 border-slate-200 text-slate-900";
              const isHeld = heldWord === tile.word;
              return (
                <button
                  key={tile.word}
                  type="button"
                  disabled={tile.disabled}
                  onClick={() => handleSelectBankWord(tile.word)}
                  className={`flex h-full min-h-[30px] items-center justify-center rounded-xl border text-[10px] font-semibold uppercase tracking-wide transition sm:h-[clamp(26px,3.2vh,34px)] sm:min-h-0 sm:text-xs ${
                    tile.disabled ? "cursor-not-allowed opacity-50" : "hover:-translate-y-0.5 hover:shadow-sm"
                  } ${tone} ${isHeld ? "ring-2 ring-slate-400 ring-offset-2" : ""}`}
                >
                  {tile.word}
                </button>
              );
            })}
          </div>
        </section>
      </main>

      {showResultsModal ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 px-4">
          <div className="relative w-full max-w-lg max-h-[85svh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <button
              type="button"
              onClick={() => setIsResultsOpen(false)}
              aria-label="Close results"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-sm font-semibold text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700"
            >
              ×
            </button>
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="rounded-full bg-slate-900 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-amber-50">
                {result === "win" ? "Win" : "Loss"}
              </div>
              <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                Word Chains #{puzzle.puzzleNumber}
              </p>
              <h3 className="text-2xl font-semibold">
                {result === "win"
                  ? `Solved in ${submittedCount} ${submittedCount === 1 ? "try" : "tries"}!`
                  : "Out of Guesses"}
              </h3>
              <div className="mt-2 w-full max-w-[220px] space-y-1 text-xs font-semibold uppercase tracking-wide text-slate-600">
                {puzzle.words_1_to_8.map((word, idx) => (
                  <div
                    key={`${word}-${idx}`}
                    className={`flex items-center justify-center rounded-full border px-2 py-1 text-[11px] ${successTone}`}
                  >
                    {word}
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={copyShare}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-amber-50 transition hover:bg-slate-800"
              >
                Share
              </button>
              {hasNextPuzzle === null ? (
                <div className="text-sm text-slate-600">
                  Checking for next puzzle...
                </div>
              ) : canAdvance ? (
                <button
                  type="button"
                  onClick={onNextPuzzle}
                  className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold uppercase tracking-wide text-slate-700 transition hover:border-slate-400"
                >
                  Next Puzzle
                </button>
              ) : (
                <div className="text-sm text-slate-600">All puzzles complete</div>
              )}
            </div>
            {shareMessage ? (
              <div className="mt-2 text-center text-xs font-medium text-amber-700">
                {shareMessage}
              </div>
            ) : null}

            <div className="mt-5 border-t border-slate-200 pt-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Feedback
              </h4>
              <div className="mt-3 grid gap-2">
                <label className="text-xs font-semibold text-slate-600">
                  Your name
                  <input
                    type="text"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      if (feedbackSaved) setFeedbackSaved(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    placeholder="Optional"
                  />
                </label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-slate-600">
                    Difficulty
                    <select
                      value={difficultyRating}
                      onChange={(event) => {
                        setDifficultyRating(Number(event.target.value));
                        if (feedbackSaved) setFeedbackSaved(false);
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                        <option key={`difficulty-${value}`} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="text-xs font-semibold text-slate-600">
                    Logicalness
                    <select
                      value={creativityRating}
                      onChange={(event) => {
                        setCreativityRating(Number(event.target.value));
                        if (feedbackSaved) setFeedbackSaved(false);
                      }}
                      className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                        <option key={`creativity-${value}`} value={value}>
                          {value}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="text-xs font-semibold text-slate-600">
                  Comments
                  <textarea
                    value={comment}
                    onChange={(event) => {
                      setComment(event.target.value);
                      if (feedbackSaved) setFeedbackSaved(false);
                    }}
                    className="mt-1 min-h-[64px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    placeholder="What worked? What didn’t?"
                  />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    onClick={saveFeedback}
                    disabled={feedbackSaving}
                    className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition ${
                      feedbackSaving
                        ? "cursor-not-allowed bg-amber-200"
                        : "bg-amber-500 hover:bg-amber-600"
                    }`}
                  >
                    {feedbackSaving ? "Saving..." : "Save Feedback"}
                  </button>
                  {feedbackSaved ? (
                    <span className="text-xs font-semibold text-emerald-600">
                      Saved
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showHelp ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  How to play
                </p>
                <h3 className="text-2xl font-semibold text-slate-900">
                  Word Chains
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                aria-label="Close help"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <p>
                Build the 8-word chain. Words 1 and 8 are shown; fill in the six
                missing links from the word bank.
              </p>
              <div className="rounded-xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Sample chain
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-700">
                  {[
                    "Key",
                    "Chain",
                    "Reaction",
                    "Time",
                    "Zone",
                    "Defense",
                    "Mechanism",
                    "Failure",
                  ].map((word, idx) => (
                    <span key={word} className="flex items-center gap-1">
                      <span className="rounded-full border border-slate-200 bg-white px-2 py-1 text-[11px]">
                        {word}
                      </span>
                      {idx < 7 ? <span className="text-slate-300">→</span> : null}
                    </span>
                  ))}
                </div>
                <p className="mt-2 text-xs text-slate-500">
                  Each adjacent pair forms a common phrase (Key Chain, Chain
                  Reaction, Reaction Time, etc.).
                </p>
              </div>
              <ul className="list-disc space-y-2 pl-5">
                <li>Tap a bank word to hold it, then tap a slot to place.</li>
                <li>Tap a placed word to remove it.</li>
                <li>You get 4 guesses. Submit when all 6 slots are filled.</li>
                <li>
                  Colors: green is correct spot, yellow is wrong spot, red is not
                  in the chain.
                </li>
                <li>Bank tiles remember your best-known color.</li>
              </ul>
            </div>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setShowHelp(false)}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-50 transition hover:bg-slate-800"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default WordChainsGame;

type CompletionPayload = {
  puzzleRowId: number;
  result: "win" | "loss";
  attempts: number;
  durationSeconds: number;
};

type NextPuzzleResponse = {
  puzzle: Puzzle | null;
  has_next: boolean;
  error?: string;
};

export function WordChainsApp() {
  const [userId] = useState(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem(STORAGE_USER_ID);
    return stored ?? createUserId();
  });
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [queuedPuzzle, setQueuedPuzzle] = useState<Puzzle | null>(null);
  const [hasNextPuzzle, setHasNextPuzzle] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchNextPuzzle = async (id: string) => {
    const response = await fetch("/api/next-puzzle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as NextPuzzleResponse;
      throw new Error(payload?.error || "Unable to load puzzle.");
    }
    const payload = (await response.json()) as NextPuzzleResponse;
    return payload.puzzle;
  };

  useEffect(() => {
    if (!userId) return;
    localStorage.setItem(STORAGE_USER_ID, userId);
    let isMounted = true;
    const load = async () => {
      try {
        const userResponse = await fetch("/api/user", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            name: localStorage.getItem(STORAGE_USER_NAME),
          }),
        });
        if (!userResponse.ok) {
          const payload = await userResponse.json();
          throw new Error(payload?.error || "Unable to register user.");
        }
        const puzzle = await fetchNextPuzzle(userId);
        if (!isMounted) return;
        setCurrentPuzzle(puzzle);
        setHasNextPuzzle(null);
        setStatus(puzzle ? "ready" : "empty");
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error ? error.message : "Unable to load puzzle.";
        setErrorMessage(message);
        setStatus("error");
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [userId]);

  const handlePuzzleComplete = async ({
    puzzleRowId,
    result,
    attempts,
    durationSeconds,
  }: CompletionPayload) => {
    if (!userId) return;
    try {
      const response = await fetch("/api/plays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          puzzle_row_id: puzzleRowId,
          result,
          attempts,
          duration_seconds: durationSeconds,
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || "Unable to save progress.");
      }
      setHasNextPuzzle(null);
      const nextPuzzle = await fetchNextPuzzle(userId);
      setQueuedPuzzle(nextPuzzle);
      setHasNextPuzzle(Boolean(nextPuzzle));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save progress.";
      setErrorMessage(message);
    }
  };

  const handleNextPuzzle = () => {
    if (queuedPuzzle) {
      setCurrentPuzzle(queuedPuzzle);
      setQueuedPuzzle(null);
      setHasNextPuzzle(null);
      return;
    }
    setCurrentPuzzle(null);
    setStatus("empty");
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center bg-amber-50 px-6 text-center text-slate-900">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-500">
          Loading puzzle
        </p>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center bg-amber-50 px-6 text-center text-slate-900">
        <h2 className="text-2xl font-semibold">Unable to load puzzles</h2>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          {errorMessage ?? "Check your Supabase configuration and try again."}
        </p>
      </div>
    );
  }

  if (status === "empty" || !currentPuzzle) {
    return (
      <div className="flex min-h-[100svh] flex-col items-center justify-center bg-amber-50 px-6 text-center text-slate-900">
        <h2 className="text-2xl font-semibold">All puzzles complete</h2>
        <p className="mt-2 max-w-md text-sm text-slate-600">
          Thanks for testing Word Chains. You have completed every available
          puzzle on this device.
        </p>
      </div>
    );
  }

  return (
    <WordChainsGame
      key={currentPuzzle.id}
      puzzle={currentPuzzle}
      userId={userId}
      hasNextPuzzle={hasNextPuzzle}
      onNextPuzzle={handleNextPuzzle}
      onPuzzleComplete={handlePuzzleComplete}
    />
  );
}
