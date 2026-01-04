export type TileColor = "green" | "yellow" | "red" | "blank";

export type ValidationResult = {
  colors: TileColor[];
  allGreen: boolean;
};

const hashString = (input: string) => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return hash;
};

const mulberry32 = (seed: number) => {
  let t = seed + 0x6d2b79f5;
  return () => {
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const seededShuffle = <T,>(items: T[], seedText: string) => {
  const arr = [...items];
  const random = mulberry32(hashString(seedText));
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

export const validateGuess = (solution: string[], guess: string[]): ValidationResult => {
  const colors: TileColor[] = Array(guess.length).fill("red");
  const solutionCounts: Record<string, number> = {};

  solution.forEach((word) => {
    solutionCounts[word] = (solutionCounts[word] ?? 0) + 1;
  });

  // First pass: greens
  guess.forEach((word, idx) => {
    if (word === solution[idx]) {
      colors[idx] = "green";
      solutionCounts[word] -= 1;
    }
  });

  // Second pass: yellows
  guess.forEach((word, idx) => {
    if (colors[idx] === "green") return;
    if (solutionCounts[word] > 0) {
      colors[idx] = "yellow";
      solutionCounts[word] -= 1;
    }
  });

  return {
    colors,
    allGreen: colors.every((c) => c === "green"),
  };
};

export const bestColorUpgrade = (current: TileColor, next: TileColor) => {
  const rank = { blank: 0, red: 1, yellow: 2, green: 3 } as const;
  return rank[next] > rank[current] ? next : current;
};

export const emojiForColor = (color: TileColor) => {
  if (color === "green") return "🟩";
  if (color === "yellow") return "🟨";
  if (color === "red") return "🟥";
  return "⬜️";
};

export const formatShareGrid = (rows: TileColor[][]) =>
  rows
    .map((row) => row.map((c) => emojiForColor(c)).join(""))
    .join("\n");

export const formatShareText = (puzzleNumber: number, grid: TileColor[][]) =>
  [`Word Chains #${puzzleNumber}`, formatShareGrid(grid)].join("\n");

export const msUntilMidnight = () => {
  const now = new Date();
  const midnight = new Date(now);
  midnight.setHours(24, 0, 0, 0);
  return midnight.getTime() - now.getTime();
};
