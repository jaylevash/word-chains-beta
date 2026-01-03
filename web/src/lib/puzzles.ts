export type PuzzleMode = "daily" | "archive";

export type Puzzle = {
  id: string;
  puzzleNumber: number;
  mode?: PuzzleMode;
  words_1_to_8: [string, string, string, string, string, string, string, string];
  dummy_words: string[];
  difficulty?: "GREEN" | "BLUE" | "PURPLE";
};
