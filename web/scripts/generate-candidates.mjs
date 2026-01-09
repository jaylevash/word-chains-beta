import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { stdin as input, stdout as output } from "node:process";
import readline from "node:readline/promises";

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
const openaiKey = process.env.OPENAI_API_KEY;
const model = process.env.OPENAI_MODEL || "gpt-4.1";
const temperature = Number(process.env.OPENAI_TEMPERATURE ?? "0.5");
const presencePenalty = Number(process.env.OPENAI_PRESENCE_PENALTY ?? "0.2");
const frequencyPenalty = Number(process.env.OPENAI_FREQUENCY_PENALTY ?? "0.2");
const varietyDays = Number(process.env.PUZZLE_VARIETY_DAYS ?? "14");
const approveStatus = process.env.PUZZLE_APPROVE_STATUS || "approved";
const maxReusedWords = Number(process.env.MAX_REUSED_WORDS ?? "4");
const retryAttempts = Number(process.env.RETRY_ATTEMPTS ?? "8");
const hardBlockEndpoints =
  String(process.env.HARD_BLOCK_ENDPOINTS ?? "false").toLowerCase() === "true";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!openaiKey) {
  console.error("Missing OPENAI_API_KEY.");
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
const isSingleWord = (value) => !/[\s-]/.test(value.trim());
const isTitleCase = (value) =>
  value.length > 0 &&
  value[0] === value[0].toUpperCase() &&
  value.slice(1) === value.slice(1).toLowerCase();

const wordKeys = Array.from({ length: 8 }, (_, idx) => `word_${idx + 1}`);
const dummyKeys = Array.from({ length: 10 }, (_, idx) => `dummy_${idx + 1}`);
const qaKeys = Array.from({ length: 7 }, (_, idx) => `qa_link_${idx + 1}`);

const difficultyPlan = [
  ..."EASY,EASY,EASY,EASY,EASY,EASY,MEDIUM,MEDIUM,MEDIUM,HARD".split(","),
];

const fetchPrompt = async (
  difficulty,
  bannedLinks,
  bannedEndpoints,
  avoidWords,
  hardBlockLinks,
  hardBlockWords,
  attemptSeed
) => {
  const linksList = bannedLinks.length ? bannedLinks.join(", ") : "none";
  const endpointsList = bannedEndpoints.length ? bannedEndpoints.join(", ") : "none";
  const avoidList = avoidWords.length ? avoidWords.join(", ") : "none";
  const hardLinksList = hardBlockLinks.length ? hardBlockLinks.join(", ") : "none";
  const hardWordsList =
    hardBlockEndpoints && hardBlockWords.length
      ? hardBlockWords.join(", ")
      : "none";

  return `
REQUEST_ID: ${attemptSeed}

Create ONE Word Chains puzzle following ALL rules below.
You MUST follow every constraint exactly. This puzzle will be ingested into a database and any deviation will break the system.

==============================
ANTI-DUPLICATION (CRITICAL)
Avoid reusing qa_links from the last ${varietyDays} days.
Avoid reusing endpoints (word_1 or word_8) from the last ${varietyDays} days.
You MAY reuse 1-2 words if they form new links.
Do NOT reuse any qa_link in the banned list below.
Try to avoid the recent words list below when possible.

BANNED QA_LINKS (hard block):
${hardLinksList}

BANNED WORDS (hard block):
${hardWordsList}

BANNED QA_LINKS:
${linksList}

BANNED ENDPOINTS:
${endpointsList}

RECENT WORDS TO AVOID (soft):
${avoidList}

==============================
TARGET STYLE (CRITICAL)
The chain must feel NYT Connections–adjacent: clever, linguistic, and fair.
Prefer tight linguistic pivots between adjacent words:
common compounds (paper + clip → paperclip)
set phrases / collocations (pitch + deck)
roles or titles strongly associated (board → chair)
strong everyday associations forming a recognized phrase
Word-sense pivots allowed only if widely recognized and unambiguous.
Avoid storybook or scientific causality chains unless explicitly requested.
Each step should produce an “aha, yes” reaction.
Avoid repeating the same chain template from the last 25 puzzles.

==============================
CORE STRUCTURE
The puzzle is an 8-word chain:
Word1 → Word2 → Word3 → Word4 → Word5 → Word6 → Word7 → Word8
Word1 and Word8 are chosen by you unless endpoints are explicitly provided.
Words 2–7 are the six missing words the player must guess.
There is EXACTLY ONE correct full chain.

==============================
CONNECTION RULES (STRICT)
Each adjacent pair MUST have a clear, defensible relationship.
A college-educated adult should recognize the link without obscure trivia.
Preferred connection types (in order):
compounds / portmanteau adjacency
set phrases / collocations
commonly associated roles or titles
strong real-world association forming a recognized phrase
category → member ONLY if it forms a widely recognized named term (e.g., “test drive”, “shot clock”)
Avoid vague “they’re related” logic.
BANNED: links that rely on implied missing letters, prefixes, or suffixes (e.g., Line → Back implying “linebacker”).

==============================
WORD CONSTRAINTS (STRICT)
ALL words must be SINGLE WORDS:
NO spaces
NO hyphens
Proper nouns ARE allowed.
No profanity or slurs.
No duplicate words anywhere (case-insensitive).
Avoid plural/singular trickery (KING vs KINGS).
Avoid homographs unless meaning is unambiguous.

==============================
WORD BANK (VERY IMPORTANT)
Output EXACTLY 18 total words:
8 chain words (word_1–word_8)
EXACTLY 10 dummy words (dummy_1–dummy_10)
Dummy words MUST:
be single words
be thematically related and tempting
NOT enable an alternate full valid chain
NOT duplicate any chain word
NOT duplicate any other dummy (case-insensitive)
BANNED DUMMIES (CRITICAL):
A dummy may NOT be the fused/compound form of ANY adjacent chain pair (e.g., Dead → Line ⇒ “deadline” is banned).
A dummy may NOT be a near-fused truncation/variant that effectively gives away a link (e.g., “lineback” / “linebacker” for Line → Back).
Dummy words may almost fit ONE step but must fail by step 3–4.

==============================
DIFFICULTY
Assign ONE difficulty label:
EASY – obvious compounds / collocations
MEDIUM – mild abstraction, still very fair
HARD – layered linguistic or cultural reasoning (not obscure trivia)

Difficulty for this puzzle MUST be: ${difficulty}

==============================
FAIRNESS REQUIREMENTS
Each adjacent link must be explainable in ONE sentence.
No alternate full chain should be possible using any dummy words.
If ambiguity exists, regenerate the puzzle.

==============================
CASING STANDARD (CRITICAL)
All word_* and dummy_* values must be Title Case (first letter uppercase, rest lowercase), unless a conventional proper noun requires otherwise.
All qa_link_* values must be lowercase.

==============================
QA LINKS (REQUIRED)
You MUST output qa_link_1 through qa_link_7.
None may be null or empty.
Each must correspond EXACTLY to the adjacent relationship:
qa_link_1 = word_1 → word_2
…
qa_link_7 = word_7 → word_8
QA links may be:
a standard one-word compound (snowball)
a two-word phrase with a single space (court case)
No hyphens allowed in QA links.

==============================
OUTPUT FORMAT (STRICT)
Return a single JSON object with these keys:
difficulty,
word_1..word_8,
dummy_1..dummy_10,
qa_link_1..qa_link_7
No extra keys. No explanations.`;
};

const fetchRecentData = async () => {
  const { data, error } = await supabase
    .from("puzzles")
    .select(
      [
        "id",
        "created_at",
        ...wordKeys,
        ...qaKeys,
      ].join(",")
    )
    .order("id", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const cutoff = new Date(Date.now() - varietyDays * 86400000);
  const recent = (data ?? []).filter((row) => {
    if (!row.created_at) return false;
    const createdAt = new Date(row.created_at);
    return createdAt >= cutoff;
  });

  const bannedLinks = new Set();
  const bannedEndpoints = new Set();
  const bannedWords = new Set();

  for (const row of recent) {
    qaKeys.forEach((key) => {
      const value = row[key];
      if (value) bannedLinks.add(normalizeLink(value));
    });
    const left = row.word_1;
    const right = row.word_8;
    if (left) bannedEndpoints.add(normalizeWord(left));
    if (right) bannedEndpoints.add(normalizeWord(right));
    wordKeys.forEach((key) => {
      const value = row[key];
      if (value) bannedWords.add(normalizeWord(value));
    });
  }

  return {
    bannedLinks: Array.from(bannedLinks).sort(),
    bannedEndpoints: Array.from(bannedEndpoints).sort(),
    avoidWords: Array.from(bannedWords).sort().slice(0, 80),
  };
};

const requestCandidate = async (prompt) => {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${openaiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature,
      top_p: 1,
      frequency_penalty: frequencyPenalty,
      presence_penalty: presencePenalty,
      max_tokens: 1200,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a puzzle generator that follows instructions exactly.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI error: ${response.status} ${body}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("No content returned from OpenAI.");
  }
  return JSON.parse(content);
};

const validateCandidate = (candidate, difficulty, bannedLinks, bannedEndpoints, avoidWords, batchLinks, batchEndpoints) => {
  const errors = [];
  const requiredKeys = [
    "difficulty",
    ...wordKeys,
    ...dummyKeys,
    ...qaKeys,
  ];
  requiredKeys.forEach((key) => {
    if (!(key in candidate)) {
      errors.push(`Missing ${key}.`);
    }
  });
  if (errors.length) return errors;

  if (candidate.difficulty !== difficulty) {
    errors.push(`Difficulty is ${candidate.difficulty}, expected ${difficulty}.`);
  }

  const chainWords = wordKeys.map((key) => candidate[key]);
  const dummyWords = dummyKeys.map((key) => candidate[key]);
  const qaLinks = qaKeys.map((key) => candidate[key]);

  const normalizedChain = chainWords.map(normalizeWord);
  const normalizedDummy = dummyWords.map(normalizeWord);
  const normalizedAll = [...normalizedChain, ...normalizedDummy];

  const seen = new Set();
  normalizedAll.forEach((word) => {
    if (seen.has(word)) errors.push(`Duplicate word "${word}".`);
    seen.add(word);
  });

  const reusedWords = normalizedChain.filter((word) => avoidWords.has(word));
  if (reusedWords.length > maxReusedWords) {
    errors.push(`Too many reused words (${reusedWords.join(", ")}).`);
  }

  chainWords.forEach((word) => {
    if (!isSingleWord(word)) errors.push(`Chain word "${word}" not single word.`);
    if (!isTitleCase(word)) errors.push(`Chain word "${word}" not Title Case.`);
  });
  dummyWords.forEach((word) => {
    if (!isSingleWord(word)) errors.push(`Dummy word "${word}" not single word.`);
    if (!isTitleCase(word)) errors.push(`Dummy word "${word}" not Title Case.`);
  });

  const chainSet = new Set(normalizedChain);
  const overlap = normalizedDummy.filter((word) => chainSet.has(word));
  if (overlap.length) {
    errors.push(`Dummy words overlap chain (${overlap.join(", ")}).`);
  }

  const fusedPairs = [];
  for (let i = 0; i < chainWords.length - 1; i += 1) {
    fusedPairs.push(normalizeWord(`${chainWords[i]}${chainWords[i + 1]}`));
  }
  const fusedSet = new Set(fusedPairs);
  const fusedOverlap = normalizedDummy.filter((word) => fusedSet.has(word));
  if (fusedOverlap.length) {
    errors.push(`Dummy words match fused pairs (${fusedOverlap.join(", ")}).`);
  }

  const normalizedLinks = qaLinks.map(normalizeLink);
  normalizedLinks.forEach((link, idx) => {
    if (!link) errors.push(`qa_link_${idx + 1} missing.`);
    if (link.includes("-")) errors.push(`qa_link_${idx + 1} has hyphen.`);
    if (link !== link.toLowerCase()) errors.push(`qa_link_${idx + 1} not lowercase.`);
    const left = normalizeWord(chainWords[idx]);
    const right = normalizeWord(chainWords[idx + 1]);
    const expectedCompound = `${left}${right}`;
    const expectedPhrase = `${left} ${right}`;
    if (link !== expectedCompound && link !== expectedPhrase) {
      errors.push(`qa_link_${idx + 1} does not match "${left} ${right}".`);
    }
  });

  const linkConflicts = normalizedLinks.filter(
    (link) => bannedLinks.has(link) || batchLinks.has(link)
  );
  if (linkConflicts.length) {
    errors.push(`qa_links already used (${linkConflicts.join(", ")}).`);
  }

  const endpoints = [
    normalizeWord(chainWords[0]),
    normalizeWord(chainWords[7]),
  ];
  if (hardBlockEndpoints) {
    const endpointConflicts = endpoints.filter(
      (word) => bannedEndpoints.has(word) || batchEndpoints.has(word)
    );
    if (endpointConflicts.length) {
      errors.push(`Endpoints already used (${endpointConflicts.join(", ")}).`);
    }
  }

  return errors;
};

const extractList = (message) => {
  const match = message.match(/\(([^)]+)\)/);
  if (!match) return [];
  return match[1]
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const insertCandidate = async (candidate) => {
  const payload = {
    difficulty: candidate.difficulty,
  };
  wordKeys.forEach((key) => (payload[key] = candidate[key]));
  dummyKeys.forEach((key) => (payload[key] = candidate[key]));
  qaKeys.forEach((key) => (payload[key] = candidate[key]));
  payload.status = approveStatus;

  const { error } = await supabase.from("puzzle_candidates").insert(payload);
  if (error) throw new Error(error.message);
};

const run = async () => {
  const { bannedLinks, bannedEndpoints, avoidWords } = await fetchRecentData();
  const bannedLinksSet = new Set(bannedLinks);
  const bannedEndpointsSet = new Set(bannedEndpoints);
  const avoidWordSet = new Set(avoidWords);
  const batchLinks = new Set();
  const batchEndpoints = new Set();

  const rl = readline.createInterface({ input, output });
  let approved = 0;
  let rejected = 0;
  const hardBlockLinks = new Set();
  const hardBlockWords = new Set();

  for (const difficulty of difficultyPlan) {
    let candidate = null;
    let errors = [];
    for (let attempt = 0; attempt < retryAttempts; attempt += 1) {
      const attemptSeed = Math.random().toString(36).slice(2);
      const prompt = await fetchPrompt(
        difficulty,
        bannedLinks,
        bannedEndpoints,
        avoidWords,
        Array.from(hardBlockLinks),
        Array.from(hardBlockWords),
        attemptSeed
      );
      const response = await requestCandidate(prompt);
      errors = validateCandidate(
        response,
        difficulty,
        bannedLinksSet,
        bannedEndpointsSet,
        avoidWordSet,
        batchLinks,
        batchEndpoints
      );
      if (!errors.length) {
        candidate = response;
        break;
      }
      console.log(`Rejected candidate (auto) [${difficulty}] -> ${errors.join("; ")}`);
      errors.forEach((message) => {
        if (message.startsWith("qa_links already used")) {
          extractList(message).forEach((link) => hardBlockLinks.add(link));
        }
        if (hardBlockEndpoints && message.startsWith("Endpoints already used")) {
          extractList(message).forEach((word) =>
            hardBlockWords.add(word.toLowerCase())
          );
        }
      });
    }

    if (!candidate) {
      console.log(`Failed to generate valid ${difficulty} candidate.`);
      continue;
    }

    const chainWords = wordKeys.map((key) => candidate[key]);
    console.log("\nCandidate:");
    console.log(`Difficulty: ${candidate.difficulty}`);
    console.log(`Chain: ${chainWords.join(" -> ")}`);
    console.log(`Dummies: ${dummyKeys.map((key) => candidate[key]).join(", ")}`);
    console.log(`QA: ${qaKeys.map((key) => candidate[key]).join(" | ")}`);

    const answer = await rl.question("Approve? (y/n/q): ");
    if (answer.toLowerCase().startsWith("q")) {
      break;
    }
    if (answer.toLowerCase().startsWith("y")) {
      await insertCandidate(candidate);
      approved += 1;
      qaKeys.forEach((key) => batchLinks.add(normalizeLink(candidate[key])));
      batchEndpoints.add(normalizeWord(candidate.word_1));
      batchEndpoints.add(normalizeWord(candidate.word_8));
      console.log("Saved to puzzle_candidates.\n");
    } else {
      rejected += 1;
      console.log("Skipped.\n");
    }
  }

  rl.close();
  console.log(`Done. Approved: ${approved}, Rejected: ${rejected}`);
};

run().catch((error) => {
  console.error(`Generator error: ${error.message}`);
  process.exit(1);
});
