import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const loadEnvFile = () => {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;
  const contents = readFileSync(envPath, "utf8");
  contents.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const [key, ...rest] = trimmed.split("=");
    if (!key || rest.length === 0) return;
    if (process.env[key] && process.env[key].length > 0) return;
    let value = rest.join("=").trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  });
};

loadEnvFile();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

const normalizeWord = (value) => value.trim().toLowerCase();
const normalizeLink = (value) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const isNonEmpty = (value) => typeof value === "string" && value.trim().length > 0;
const isSingleWord = (value) => !/[\s-]/.test(value.trim());
const isTitleCase = (value) =>
  value.length > 0 &&
  value[0] === value[0].toUpperCase() &&
  value.slice(1) === value.slice(1).toLowerCase();

const makePair = (left, right) =>
  normalizeLink(`${left} ${right}`);

const wordKeys = Array.from({ length: 8 }, (_, idx) => `word_${idx + 1}`);
const dummyKeys = Array.from({ length: 10 }, (_, idx) => `dummy_${idx + 1}`);
const qaKeys = Array.from({ length: 7 }, (_, idx) => `qa_link_${idx + 1}`);

const run = async () => {
  const { data, error } = await supabase
    .from("puzzles")
    .select(
      [
        "id",
        "puzzle_id",
        "difficulty",
        ...wordKeys,
        ...dummyKeys,
        ...qaKeys,
      ].join(",")
    )
    .order("id", { ascending: true });

  if (error) {
    console.error(`Failed to load puzzles: ${error.message}`);
    process.exit(1);
  }

  const errors = [];
  const warnings = [];

  for (const row of data ?? []) {
    const chainWords = wordKeys.map((key) => row[key]);
    const dummyWords = dummyKeys.map((key) => row[key]);
    const qaLinks = qaKeys.map((key) => row[key]);
    const idLabel = row.puzzle_id || row.id;

    const missing = chainWords.filter((word) => !isNonEmpty(word));
    if (missing.length) {
      errors.push(`Puzzle ${idLabel}: missing chain words.`);
    }

    const normalizedChain = chainWords.filter(isNonEmpty).map(normalizeWord);
    const chainSet = new Set(normalizedChain);
    if (chainSet.size !== normalizedChain.length) {
      errors.push(`Puzzle ${idLabel}: duplicate words in chain.`);
    }

    const normalizedDummy = dummyWords.filter(isNonEmpty).map(normalizeWord);
    const dummySet = new Set(normalizedDummy);
    if (dummySet.size !== normalizedDummy.length) {
      errors.push(`Puzzle ${idLabel}: duplicate dummy words.`);
    }

    chainWords.forEach((word) => {
      if (!isNonEmpty(word)) return;
      if (!isSingleWord(word)) {
        errors.push(`Puzzle ${idLabel}: chain word "${word}" is not a single word.`);
      } else if (!isTitleCase(word)) {
        warnings.push(`Puzzle ${idLabel}: chain word "${word}" is not Title Case.`);
      }
    });

    dummyWords.forEach((word) => {
      if (!isNonEmpty(word)) return;
      if (!isSingleWord(word)) {
        errors.push(`Puzzle ${idLabel}: dummy word "${word}" is not a single word.`);
      } else if (!isTitleCase(word)) {
        warnings.push(`Puzzle ${idLabel}: dummy word "${word}" is not Title Case.`);
      }
    });

    const overlap = normalizedDummy.filter((word) => chainSet.has(word));
    if (overlap.length) {
      errors.push(`Puzzle ${idLabel}: dummy words overlap chain (${overlap.join(", ")}).`);
    }

    const fusedPairs = [];
    for (let i = 0; i < chainWords.length - 1; i += 1) {
      const left = chainWords[i];
      const right = chainWords[i + 1];
      if (!isNonEmpty(left) || !isNonEmpty(right)) continue;
      fusedPairs.push(normalizeWord(`${left}${right}`));
    }
    const fusedSet = new Set(fusedPairs);
    const fusedOverlap = normalizedDummy.filter((word) => fusedSet.has(word));
    if (fusedOverlap.length) {
      errors.push(
        `Puzzle ${idLabel}: dummy words match fused chain words (${fusedOverlap.join(", ")}).`
      );
    }

    if (!["GREEN", "BLUE", "PURPLE", "EASY", "MEDIUM", "HARD"].includes(row.difficulty)) {
      warnings.push(`Puzzle ${idLabel}: unexpected difficulty "${row.difficulty}".`);
    }

    qaLinks.forEach((link, idx) => {
      if (!isNonEmpty(link)) return;
      const left = chainWords[idx];
      const right = chainWords[idx + 1];
      if (!isNonEmpty(left) || !isNonEmpty(right)) return;
      const expected = makePair(left, right);
      if (normalizeLink(link) !== expected) {
        warnings.push(
          `Puzzle ${idLabel}: qa_link_${idx + 1} "${link}" ≠ "${left} ${right}".`
        );
      }
      if (link !== link.toLowerCase()) {
        warnings.push(`Puzzle ${idLabel}: qa_link_${idx + 1} is not lowercase.`);
      }
      if (link.includes("-")) {
        warnings.push(`Puzzle ${idLabel}: qa_link_${idx + 1} contains a hyphen.`);
      }
    });
  }

  console.log(`Checked ${data?.length ?? 0} puzzles.`);
  if (warnings.length) {
    console.log("\nWarnings:");
    warnings.forEach((line) => console.log(`- ${line}`));
  }
  if (errors.length) {
    console.log("\nErrors:");
    errors.forEach((line) => console.log(`- ${line}`));
    process.exitCode = 1;
  } else {
    console.log("\nNo blocking issues found.");
  }
};

run();
