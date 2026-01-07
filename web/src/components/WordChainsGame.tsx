"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Puzzle } from "@/lib/puzzles";
import { trackEvent } from "@/lib/analytics";
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
const STORAGE_STATS = "wordchains:stats:v1";
const STORAGE_STATS_LEGACY = "splice:stats:v1";
const STORAGE_ENTRY_SEEN = "wordchains:entry-seen:v1";

type StatsState = {
  totalPlayed: number;
  totalWins: number;
  totalAttempts: number;
  totalSeconds: number;
  currentStreak: number;
  maxStreak: number;
  lastDailyDate: string | null;
};

const defaultStats: StatsState = {
  totalPlayed: 0,
  totalWins: 0,
  totalAttempts: 0,
  totalSeconds: 0,
  currentStreak: 0,
  maxStreak: 0,
  lastDailyDate: null,
};

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

const getLocalDateKey = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseStats = (value: string | null): StatsState => {
  if (!value) return { ...defaultStats };
  try {
    const parsed = JSON.parse(value);
    return {
      totalPlayed: Number(parsed.totalPlayed) || 0,
      totalWins: Number(parsed.totalWins) || 0,
      totalAttempts: Number(parsed.totalAttempts) || 0,
      totalSeconds: Number(parsed.totalSeconds) || 0,
      currentStreak: Number(parsed.currentStreak) || 0,
      maxStreak: Number(parsed.maxStreak) || 0,
      lastDailyDate:
        typeof parsed.lastDailyDate === "string" ? parsed.lastDailyDate : null,
    };
  } catch {
    return { ...defaultStats };
  }
};

const formatDuration = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
};

const buildEmptySuggestion = () => Array.from({ length: 8 }, () => "");

const focusableSelector = [
  "a[href]",
  "area[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type='hidden'])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const useModalFocus = (isOpen: boolean, onClose?: () => void) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const lastFocusedRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;
    const container = containerRef.current;
    lastFocusedRef.current = document.activeElement as HTMLElement | null;

    const getFocusable = () =>
      container
        ? Array.from(
            container.querySelectorAll<HTMLElement>(focusableSelector)
          ).filter((el) => !el.hasAttribute("disabled"))
        : [];

    const focusable = getFocusable();
    if (focusable.length) {
      focusable[0].focus();
    } else if (container) {
      container.focus();
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== "Tab") return;
      const focusables = getFocusable();
      if (!focusables.length) {
        event.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (event.shiftKey) {
        if (!active || active === first) {
          event.preventDefault();
          last.focus();
        }
        return;
      }
      if (active === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      const lastFocused = lastFocusedRef.current;
      if (lastFocused && document.contains(lastFocused)) {
        lastFocused.focus();
      }
    };
  }, [isOpen, onClose]);

  return containerRef;
};

type PuzzleStats = {
  total: number;
  counts: {
    "1": number;
    "2": number;
    "3": number;
    "4": number;
    loss: number;
  };
};

export function WordChainsGame({
  puzzle,
  userId,
  hasNextPuzzle = null,
  onNextPuzzle,
  onPuzzleComplete,
  onOpenStats,
  onCloseStats,
  showStats = false,
  stats,
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
  onOpenStats?: () => void;
  onCloseStats?: () => void;
  showStats?: boolean;
  stats?: StatsState;
}) {
  const [puzzleRating, setPuzzleRating] = useState(5);
  const [comment, setComment] = useState("");
  const [showBugModal, setShowBugModal] = useState(false);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [showEntry, setShowEntry] = useState(() => {
    if (typeof window === "undefined") return true;
    return !localStorage.getItem(STORAGE_ENTRY_SEEN);
  });
  const [feedbackTrap, setFeedbackTrap] = useState("");
  const [bugTrap, setBugTrap] = useState("");
  const [suggestionTrap, setSuggestionTrap] = useState("");
  const [bugText, setBugText] = useState("");
  const [suggestionWords, setSuggestionWords] = useState(() =>
    buildEmptySuggestion()
  );
  const [bugSaving, setBugSaving] = useState(false);
  const [suggestionSaving, setSuggestionSaving] = useState(false);
  const [feedbackSaved, setFeedbackSaved] = useState(false);
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const startTimeRef = useRef<number>(Date.now());
  const shareTimeoutRef = useRef<number | null>(null);
  const trackedStartRef = useRef<string | null>(null);
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
  const [puzzleStats, setPuzzleStats] = useState<PuzzleStats | null>(null);
  const [puzzleStatsError, setPuzzleStatsError] = useState<string | null>(null);
  const [puzzleStatsLoading, setPuzzleStatsLoading] = useState(false);
  const suggestionComplete = suggestionWords.every((word) => word.trim());
  const closeResults = useCallback(() => setIsResultsOpen(false), []);
  const closeHelp = useCallback(() => setShowHelp(false), []);
  const closeBugModal = useCallback(() => setShowBugModal(false), []);
  const closeSuggestionModal = useCallback(
    () => setShowSuggestionModal(false),
    []
  );
  const closeEntry = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.setItem(STORAGE_ENTRY_SEEN, "1");
    }
    setShowEntry(false);
  }, []);
  const closeStats = useCallback(() => {
    onCloseStats?.();
  }, [onCloseStats]);
  const resultsModalRef = useModalFocus(
    result !== "playing" && isResultsOpen,
    closeResults
  );
  const helpModalRef = useModalFocus(showHelp, closeHelp);
  const statsModalRef = useModalFocus(showStats, closeStats);
  const bugModalRef = useModalFocus(showBugModal, closeBugModal);
  const suggestionModalRef = useModalFocus(
    showSuggestionModal,
    closeSuggestionModal
  );
  const entryModalRef = useModalFocus(showEntry, closeEntry);

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
      trackEvent("puzzle_complete", {
        puzzle_id: puzzle.id,
        puzzle_number: puzzle.puzzleNumber,
        mode: puzzle.mode ?? "daily",
        result: "win",
        attempts: attemptsUsed,
        duration_seconds: durationSeconds,
      });
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
      trackEvent("puzzle_complete", {
        puzzle_id: puzzle.id,
        puzzle_number: puzzle.puzzleNumber,
        mode: puzzle.mode ?? "daily",
        result: "loss",
        attempts: attemptsUsed,
        duration_seconds: durationSeconds,
      });
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
      const shareUrl = "https://wordchains.io";
      if (typeof navigator !== "undefined" && "share" in navigator) {
        try {
          await navigator.share({
            title: `Word Chains #${puzzle.puzzleNumber}`,
            text: shareText,
            url: shareUrl,
          });
          trackEvent("share", {
            puzzle_id: puzzle.id,
            puzzle_number: puzzle.puzzleNumber,
            method: "share_sheet",
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
      trackEvent("share", {
        puzzle_id: puzzle.id,
        puzzle_number: puzzle.puzzleNumber,
        method: "clipboard",
      });
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
          puzzle_row_id: puzzleRowId,
          difficulty_rating: puzzleRating,
          creativity_rating: puzzleRating,
          comment: comment.trim() || null,
          bot_trap: feedbackTrap,
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || "Unable to save feedback.");
      }
      trackEvent("feedback_submit", {
        puzzle_id: puzzle.id,
        puzzle_number: puzzle.puzzleNumber,
        puzzle_rating: puzzleRating,
        has_comment: Boolean(comment.trim()),
      });
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

  const saveBugReport = async () => {
    if (bugSaving || !bugText.trim()) return;
    if (!userId) {
      setStatusNote("Missing user id.");
      return;
    }
    setBugSaving(true);
    try {
      const response = await fetch("/api/bugs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          report: bugText.trim(),
          bot_trap: bugTrap,
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || "Unable to submit report.");
      }
      trackEvent("bug_submit");
      setBugText("");
      setShowBugModal(false);
      setStatusNote("Bug report sent. Thank you!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit report.";
      setStatusNote(message);
    } finally {
      setBugSaving(false);
    }
  };

  const saveSuggestion = async () => {
    const trimmedWords = suggestionWords.map((word) => word.trim());
    const isComplete = trimmedWords.every(Boolean);
    if (suggestionSaving || !isComplete) {
      setStatusNote("Please fill in all 8 words.");
      return;
    }
    if (!userId) {
      setStatusNote("Missing user id.");
      return;
    }
    setSuggestionSaving(true);
    try {
      const response = await fetch("/api/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: userId,
          word_1: trimmedWords[0],
          word_2: trimmedWords[1],
          word_3: trimmedWords[2],
          word_4: trimmedWords[3],
          word_5: trimmedWords[4],
          word_6: trimmedWords[5],
          word_7: trimmedWords[6],
          word_8: trimmedWords[7],
          bot_trap: suggestionTrap,
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || "Unable to submit suggestion.");
      }
      trackEvent("suggestion_submit", { word_count: trimmedWords.length });
      setSuggestionWords(buildEmptySuggestion());
      closeSuggestionModal();
      setStatusNote("Suggestion submitted. Thank you!");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to submit suggestion.";
      setStatusNote(message);
    } finally {
      setSuggestionSaving(false);
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
  const statsCounts = puzzleStats?.counts ?? null;
  const statsTotal = puzzleStats?.total ?? 0;
  const formatPercent = (value: number) => {
    if (!statsTotal) return "—";
    return `${Math.round((value / statsTotal) * 100)}%`;
  };

  const successTone =
    "bg-emerald-100 text-emerald-900 border-emerald-500";
  const totalPlayed = stats?.totalPlayed ?? 0;
  const totalWins = stats?.totalWins ?? 0;
  const winRate = totalPlayed ? Math.round((totalWins / totalPlayed) * 100) : null;
  const avgAttempts = totalPlayed
    ? (stats?.totalAttempts ?? 0) / totalPlayed
    : null;
  const avgSeconds = totalPlayed
    ? Math.round((stats?.totalSeconds ?? 0) / totalPlayed)
    : null;

  useEffect(() => {
    if (trackedStartRef.current === puzzle.id) return;
    trackedStartRef.current = puzzle.id;
    trackEvent("puzzle_start", {
      puzzle_id: puzzle.id,
      puzzle_number: puzzle.puzzleNumber,
      mode: puzzle.mode ?? "daily",
    });
  }, [puzzle.id, puzzle.puzzleNumber, puzzle.mode]);

  useEffect(() => {
    setPuzzleStats(null);
    setPuzzleStatsError(null);
    setPuzzleStatsLoading(false);
  }, [puzzle.id]);

  useEffect(() => {
    if (result !== "playing") {
      setIsResultsOpen(true);
    }
  }, [result]);

  useEffect(() => {
    const shouldFetch = result !== "playing" && puzzleRowId && !puzzleStats;
    if (!shouldFetch) return;
    let isActive = true;
    const loadStats = async () => {
      setPuzzleStatsLoading(true);
      setPuzzleStatsError(null);
      try {
        const response = await fetch("/api/puzzle-stats", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            puzzle_row_id: puzzleRowId,
            local_date: getLocalDateKey(),
          }),
        });
        if (!response.ok) {
          const payload = await response.json();
          throw new Error(payload?.error || "Unable to load puzzle stats.");
        }
        const payload = (await response.json()) as PuzzleStats;
        if (isActive) {
          setPuzzleStats(payload);
        }
      } catch (error) {
        if (!isActive) return;
        const message =
          error instanceof Error ? error.message : "Unable to load puzzle stats.";
        setPuzzleStatsError(message);
      } finally {
        if (isActive) setPuzzleStatsLoading(false);
      }
    };
    void loadStats();
    return () => {
      isActive = false;
    };
  }, [result, puzzleRowId, puzzleStats]);

  useEffect(() => {
    return () => {
      if (shareTimeoutRef.current) {
        window.clearTimeout(shareTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex min-h-[100svh] flex-col bg-amber-50 text-slate-900">
      <div className="sr-only" role="status" aria-live="polite">
        {statusNote}
      </div>
      <header className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2 sm:px-6 sm:py-4">
        <div className="justify-self-start text-xs font-semibold text-slate-500 sm:text-sm">
          Puzzle #{puzzle.puzzleNumber}
        </div>
        <h1 className="justify-self-center bg-gradient-to-r from-amber-600 via-orange-500 to-rose-500 bg-clip-text text-xl font-semibold text-transparent sm:text-3xl">
          Word Chains
        </h1>
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={() => {
              trackEvent("stats_open", {
                puzzle_id: puzzle.id,
                puzzle_number: puzzle.puzzleNumber,
                mode: puzzle.mode ?? "daily",
              });
              onOpenStats?.();
            }}
            aria-label="View stats"
            className="flex h-7 items-center justify-center rounded-full border border-slate-200 bg-white px-2 text-[10px] font-semibold uppercase tracking-wide text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700 sm:h-8 sm:px-3 sm:text-xs"
          >
            Stats
          </button>
          <button
            type="button"
            onClick={() => {
              trackEvent("help_open", {
                puzzle_id: puzzle.id,
                puzzle_number: puzzle.puzzleNumber,
                mode: puzzle.mode ?? "daily",
              });
              setShowHelp(true);
            }}
            aria-label="How to play"
            className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-[11px] font-semibold text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-700 sm:h-8 sm:w-8 sm:text-sm"
          >
            ?
          </button>
        </div>
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
                        aria-label={`${displayWord || "Empty"} slot ${slotIdx + 1}${
                          slotColor !== "blank"
                            ? slotColor === "green"
                              ? ", correct"
                              : slotColor === "yellow"
                                ? ", wrong spot"
                                : ", not in chain"
                            : ""
                        }`}
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
              const statusLabel =
                tile.bestColor === "green"
                  ? "correct"
                  : tile.bestColor === "yellow"
                    ? "wrong spot"
                    : tile.bestColor === "red"
                      ? "not in chain"
                      : "unused";
              const isHeld = heldWord === tile.word;
              return (
                <button
                  key={tile.word}
                  type="button"
                  disabled={tile.disabled}
                  onClick={() => handleSelectBankWord(tile.word)}
                  aria-label={`${tile.word}, ${statusLabel}${
                    tile.disabled ? ", unavailable" : ""
                  }`}
                  className={`flex h-full min-h-[30px] items-center justify-center rounded-xl border text-[10px] font-semibold uppercase tracking-wide transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 focus-visible:ring-offset-2 sm:h-[clamp(26px,3.2vh,34px)] sm:min-h-0 sm:text-xs ${
                    tile.disabled ? "cursor-not-allowed opacity-50" : "hover:-translate-y-0.5 hover:shadow-sm"
                  } ${tone} ${isHeld ? "ring-2 ring-slate-400 ring-offset-2" : ""}`}
                >
                  {tile.word}
                </button>
              );
            })}
          </div>
        </section>
        <footer className="grid w-full grid-cols-3 items-center px-2 text-xs font-semibold text-slate-500 sm:px-4">
          <a
            href="/privacy"
            className="justify-self-start transition hover:text-slate-700"
          >
            Privacy
          </a>
          <button
            type="button"
            onClick={() => {
              trackEvent("bug_open");
              setShowBugModal(true);
            }}
            className="justify-self-center transition hover:text-slate-700"
          >
            Report a bug
          </button>
          <button
            type="button"
            onClick={() => {
              trackEvent("suggestion_open");
              setShowSuggestionModal(true);
            }}
            className="justify-self-end transition hover:text-slate-700"
          >
            Suggest a chain
          </button>
        </footer>
      </main>

      {showEntry ? (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-slate-900/40 px-4">
          <div
            ref={entryModalRef}
            tabIndex={-1}
            className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="entry-title"
            aria-describedby="entry-desc"
          >
            <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
              Daily word-link puzzle
            </p>
            <h2
              id="entry-title"
              className="mt-2 text-3xl font-semibold text-slate-900"
            >
              Word Chains
            </h2>
            <p id="entry-desc" className="mt-2 text-sm text-slate-600">
              Connect the chain by filling the six missing words. New puzzle
              every day.
            </p>
            <div className="mt-6 flex flex-col items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  trackEvent("entry_play");
                  closeEntry();
                }}
                className="w-full rounded-full bg-slate-900 px-5 py-2.5 text-sm font-semibold uppercase tracking-wide text-amber-50 transition hover:bg-slate-800"
              >
                Play today’s puzzle
              </button>
              <button
                type="button"
                onClick={() => {
                  closeEntry();
                  trackEvent("help_open");
                  setShowHelp(true);
                }}
                className="text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-700"
              >
                How to play
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showResultsModal ? (
        <div className="fixed inset-0 z-10 flex items-center justify-center bg-black/40 px-4">
          <div
            ref={resultsModalRef}
            tabIndex={-1}
            className="relative w-full max-w-lg max-h-[85svh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="results-title"
          >
            <button
              type="button"
              onClick={closeResults}
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
              <h3 id="results-title" className="text-2xl font-semibold">
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
              {puzzle.mode === "daily" ? (
                <div className="text-sm text-slate-600">
                  New puzzle drops tomorrow.
                </div>
              ) : hasNextPuzzle === null ? (
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
              <div
                className="mt-2 text-center text-xs font-medium text-amber-700"
                role="status"
                aria-live="polite"
              >
                {shareMessage}
              </div>
            ) : null}

            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Community results
              </div>
              {puzzleStatsLoading ? (
                <div className="mt-2 text-xs text-slate-500">
                  Loading results...
                </div>
              ) : puzzleStatsError ? (
                <div className="mt-2 text-xs text-rose-600">
                  Unable to load results yet.
                </div>
              ) : statsCounts ? (
                <div className="mt-3 space-y-2 text-xs">
                  {[
                    { label: "1 Guess", count: statsCounts["1"] },
                    { label: "2 Guesses", count: statsCounts["2"] },
                    { label: "3 Guesses", count: statsCounts["3"] },
                    { label: "4 Guesses", count: statsCounts["4"] },
                    { label: "Failed", count: statsCounts.loss },
                  ].map((row) => (
                    <div key={row.label} className="flex items-center gap-3">
                      <div className="w-20 text-[11px] font-semibold uppercase text-slate-500">
                        {row.label}
                      </div>
                      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white">
                        <div
                          className="h-full rounded-full bg-emerald-400"
                          style={{
                            width: statsTotal
                              ? `${Math.min(100, (row.count / statsTotal) * 100)}%`
                              : "0%",
                          }}
                        />
                      </div>
                      <div className="w-12 text-right text-[11px] font-semibold text-slate-600">
                        {formatPercent(row.count)}
                      </div>
                    </div>
                  ))}
                  <div className="pt-1 text-[11px] text-slate-500">
                    Based on {statsTotal} completed plays.
                  </div>
                </div>
              ) : (
                <div className="mt-2 text-xs text-slate-500">
                  No results yet.
                </div>
              )}
            </div>

            <div className="mt-5 border-t border-slate-200 pt-4">
              <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Feedback
              </h4>
              <div className="mt-3 grid gap-2">
                <label className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                  Do not fill
                  <input
                    type="text"
                    value={feedbackTrap}
                    onChange={(event) => setFeedbackTrap(event.target.value)}
                    autoComplete="off"
                    tabIndex={-1}
                    aria-hidden="true"
                  />
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Puzzle rating (1-10)
                  <select
                    value={puzzleRating}
                    onChange={(event) => {
                      setPuzzleRating(Number(event.target.value));
                      if (feedbackSaved) setFeedbackSaved(false);
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => (
                      <option key={`rating-${value}`} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-xs font-semibold text-slate-600">
                  Comments (optional)
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
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent("bug_open");
                      setShowBugModal(true);
                    }}
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-700"
                  >
                    Report a bug
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      trackEvent("suggestion_open");
                      setShowSuggestionModal(true);
                    }}
                    className="text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:text-slate-700"
                  >
                    Suggest a chain
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {showHelp ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div
            ref={helpModalRef}
            tabIndex={-1}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  How to play
                </p>
                <h3 id="help-title" className="text-2xl font-semibold text-slate-900">
                  Word Chains
                </h3>
              </div>
              <button
                type="button"
                onClick={closeHelp}
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
                onClick={closeHelp}
                className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-amber-50 transition hover:bg-slate-800"
              >
                Got it
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showStats ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div
            ref={statsModalRef}
            tabIndex={-1}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="stats-title"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  Stats
                </p>
                <h3 id="stats-title" className="text-2xl font-semibold text-slate-900">
                  Word Chains
                </h3>
              </div>
              <button
                type="button"
                onClick={closeStats}
                aria-label="Close stats"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                ×
              </button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm text-slate-700">
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Played
                </div>
                <div className="mt-1 text-2xl font-semibold">{totalPlayed}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Wins
                </div>
                <div className="mt-1 text-2xl font-semibold">{totalWins}</div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Win Rate
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {winRate == null ? "—" : `${winRate}%`}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Avg Attempts
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {avgAttempts == null ? "—" : avgAttempts.toFixed(1)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Avg Time
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {avgSeconds == null ? "—" : formatDuration(avgSeconds)}
                </div>
              </div>
              <div className="rounded-xl bg-slate-50 p-3 text-center">
                <div className="text-xs uppercase tracking-wide text-slate-500">
                  Streak
                </div>
                <div className="mt-1 text-2xl font-semibold">
                  {stats?.currentStreak ?? 0}
                </div>
                <div className="mt-1 text-[11px] text-slate-500">
                  Best {stats?.maxStreak ?? 0}
                </div>
              </div>
            </div>
            <div className="mt-4 text-xs text-slate-500">
              Streak counts consecutive days played.
            </div>
          </div>
        </div>
      ) : null}

      {showBugModal ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div
            ref={bugModalRef}
            tabIndex={-1}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bug-title"
            aria-describedby="bug-helper"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  Report a bug
                </p>
                <h3 id="bug-title" className="text-2xl font-semibold text-slate-900">
                  Word Chains
                </h3>
                <p id="bug-helper" className="mt-2 text-xs text-slate-500">
                  Describe what you saw and what you expected instead.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBugModal}
                aria-label="Close bug report"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                ×
              </button>
            </div>
            <div className="mt-4 space-y-3 text-sm text-slate-600">
              <label className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                Do not fill
                <input
                  type="text"
                  value={bugTrap}
                  onChange={(event) => setBugTrap(event.target.value)}
                  autoComplete="off"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                What happened?
                <textarea
                  value={bugText}
                  onChange={(event) => setBugText(event.target.value)}
                  className="mt-1 min-h-[120px] w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                  placeholder="Tell us what went wrong..."
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeBugModal}
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveBugReport}
                disabled={bugSaving || !bugText.trim()}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition ${
                  bugSaving || !bugText.trim()
                    ? "cursor-not-allowed bg-amber-200"
                    : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {bugSaving ? "Sending..." : "Send report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showSuggestionModal ? (
        <div className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 px-4">
          <div
            ref={suggestionModalRef}
            tabIndex={-1}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl"
            role="dialog"
            aria-modal="true"
            aria-labelledby="suggest-title"
            aria-describedby="suggest-helper"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.25em] text-slate-500">
                  Suggest a chain
                </p>
                <h3 id="suggest-title" className="text-2xl font-semibold text-slate-900">
                  Word Chains
                </h3>
                <p id="suggest-helper" className="mt-2 text-xs text-slate-500">
                  Enter the full 8-word chain, one word per box.
                </p>
              </div>
              <button
                type="button"
                onClick={closeSuggestionModal}
                aria-label="Close suggestion"
                className="flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 text-sm font-semibold text-slate-500 transition hover:border-slate-300 hover:text-slate-700"
              >
                ×
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2 text-sm text-slate-600 sm:grid-cols-4">
              <label className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
                Do not fill
                <input
                  type="text"
                  value={suggestionTrap}
                  onChange={(event) => setSuggestionTrap(event.target.value)}
                  autoComplete="off"
                  tabIndex={-1}
                  aria-hidden="true"
                />
              </label>
              {suggestionWords.map((value, idx) => (
                <label
                  key={`suggest-word-${idx}`}
                  className="text-xs font-semibold text-slate-600"
                >
                  Word {idx + 1}
                  <input
                    type="text"
                    value={value}
                    onChange={(event) => {
                      const nextValue = event.target.value;
                      setSuggestionWords((prev) => {
                        const next = [...prev];
                        next[idx] = nextValue;
                        return next;
                      });
                    }}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-300"
                    placeholder={`Word ${idx + 1}`}
                  />
                </label>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              All 8 words are required before submitting.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeSuggestionModal}
                className="rounded-full border border-slate-300 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-slate-400"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={saveSuggestion}
                disabled={suggestionSaving || !suggestionComplete}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition ${
                  suggestionSaving || !suggestionComplete
                    ? "cursor-not-allowed bg-amber-200"
                    : "bg-amber-500 hover:bg-amber-600"
                }`}
              >
                {suggestionSaving ? "Sending..." : "Send suggestion"}
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

type PuzzleResponse = {
  puzzle: Puzzle | null;
  error?: string;
};

export function WordChainsApp({ initialPuzzleId }: { initialPuzzleId?: number } = {}) {
  const [userId] = useState(() => {
    if (typeof window === "undefined") return "";
    const stored = localStorage.getItem(STORAGE_USER_ID);
    return stored ?? createUserId();
  });
  const [dailyKey] = useState(() => getLocalDateKey());
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [queuedPuzzle, setQueuedPuzzle] = useState<Puzzle | null>(null);
  const [hasNextPuzzle, setHasNextPuzzle] = useState<boolean | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "empty" | "error">(
    "loading"
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [stats, setStats] = useState<StatsState>(() => {
    if (typeof window === "undefined") return { ...defaultStats };
    const stored =
      localStorage.getItem(STORAGE_STATS) ??
      localStorage.getItem(STORAGE_STATS_LEGACY);
    return parseStats(stored);
  });
  const [showStats, setShowStats] = useState(false);

  const fetchNextPuzzle = async (id: string, localDate?: string) => {
    const response = await fetch("/api/next-puzzle", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: id, local_date: localDate }),
    });
    if (!response.ok) {
      const payload = (await response.json()) as NextPuzzleResponse;
      throw new Error(payload?.error || "Unable to load puzzle.");
    }
    const payload = (await response.json()) as NextPuzzleResponse;
    return payload.puzzle;
  };

  const fetchPuzzleById = async (id: number) => {
    const response = await fetch(`/api/puzzle/${id}`);
    if (!response.ok) {
      const payload = (await response.json()) as PuzzleResponse;
      throw new Error(payload?.error || "Unable to load puzzle.");
    }
    const payload = (await response.json()) as PuzzleResponse;
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
          }),
        });
        if (!userResponse.ok) {
          const payload = await userResponse.json();
          throw new Error(payload?.error || "Unable to register user.");
        }
        const puzzle = initialPuzzleId
          ? await fetchPuzzleById(initialPuzzleId)
          : await fetchNextPuzzle(userId, dailyKey);
        if (!isMounted) return;
        setCurrentPuzzle(puzzle);
        setHasNextPuzzle(false);
        setStatus(puzzle ? "ready" : "empty");
        if (initialPuzzleId && puzzle) {
          trackEvent("archive_play", {
            puzzle_id: puzzle.id,
            puzzle_number: puzzle.puzzleNumber,
          });
        }
      } catch (error) {
        if (!isMounted) return;
        const message =
          error instanceof Error ? error.message : "Unable to load puzzle.";
        trackEvent("puzzle_error", {
          message,
          location: "initial_load",
        });
        setErrorMessage(message);
        setStatus("error");
      }
    };
    load();
    return () => {
      isMounted = false;
    };
  }, [userId, initialPuzzleId, dailyKey]);

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
          local_date: getLocalDateKey(),
        }),
      });
      if (!response.ok) {
        const payload = await response.json();
        throw new Error(payload?.error || "Unable to save progress.");
      }
      setStats((prev) => {
        const next: StatsState = {
          ...prev,
          totalPlayed: prev.totalPlayed + 1,
          totalWins: prev.totalWins + (result === "win" ? 1 : 0),
          totalAttempts: prev.totalAttempts + attempts,
          totalSeconds: prev.totalSeconds + durationSeconds,
        };
        const todayKey = getLocalDateKey();
        if (currentPuzzle?.mode === "daily" && prev.lastDailyDate !== todayKey) {
          if (prev.lastDailyDate) {
            const lastDate = new Date(`${prev.lastDailyDate}T00:00:00`);
            const today = new Date(`${todayKey}T00:00:00`);
            const diffDays = Math.round(
              (today.getTime() - lastDate.getTime()) / 86400000
            );
            next.currentStreak = diffDays === 1 ? prev.currentStreak + 1 : 1;
          } else {
            next.currentStreak = 1;
          }
          next.maxStreak = Math.max(next.maxStreak, next.currentStreak);
          next.lastDailyDate = todayKey;
        }
        if (typeof window !== "undefined") {
          localStorage.setItem(STORAGE_STATS, JSON.stringify(next));
        }
        return next;
      });
      if (initialPuzzleId || currentPuzzle?.mode === "daily") {
        setHasNextPuzzle(false);
        setQueuedPuzzle(null);
        return;
      }
      setHasNextPuzzle(null);
      const nextPuzzle = await fetchNextPuzzle(userId);
      setQueuedPuzzle(nextPuzzle);
      setHasNextPuzzle(Boolean(nextPuzzle));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save progress.";
      trackEvent("puzzle_error", {
        message,
        location: "save_progress",
      });
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
      showStats={showStats}
      stats={stats}
      onOpenStats={() => setShowStats(true)}
      onCloseStats={() => setShowStats(false)}
    />
  );
}
