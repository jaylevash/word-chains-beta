import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";
import {
  clampText,
  enforceJson,
  enforceOrigin,
  enforceRateLimit,
} from "@/lib/request-guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const originGuard = enforceOrigin(request);
  if (originGuard) return originGuard;
  const jsonGuard = enforceJson(request);
  if (jsonGuard) return jsonGuard;
  const rateGuard = await enforceRateLimit({
    request,
    key: "suggestions",
    limit: 6,
    windowSeconds: 3600,
  });
  if (rateGuard) return rateGuard;

  let payload: Record<string, unknown>;
  try {
    payload = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const {
    user_id,
    user_name,
    word_1,
    word_2,
    word_3,
    word_4,
    word_5,
    word_6,
    word_7,
    word_8,
    bot_trap,
  } = payload as {
    user_id?: string;
    user_name?: string | null;
    word_1?: string;
    word_2?: string;
    word_3?: string;
    word_4?: string;
    word_5?: string;
    word_6?: string;
    word_7?: string;
    word_8?: string;
    bot_trap?: string | null;
  };

  if (bot_trap && String(bot_trap).trim()) {
    return NextResponse.json({ ok: true });
  }

  const words = [word_1, word_2, word_3, word_4, word_5, word_6, word_7, word_8];
  const hasAllWords = words.every(
    (word) => typeof word === "string" && word.trim().length > 0
  );

  if (!user_id || !hasAllWords) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const trimmedWords = words.map((word) => clampText(word, 40));
  if (trimmedWords.some((word) => !word)) {
    return NextResponse.json({ error: "invalid words" }, { status: 400 });
  }

  const trimmedName = clampText(user_name, 50);

  const { error } = await supabaseAdmin.from("puzzle_suggestions").insert({
    user_id,
    user_name: trimmedName || null,
    word_1: trimmedWords[0],
    word_2: trimmedWords[1],
    word_3: trimmedWords[2],
    word_4: trimmedWords[3],
    word_5: trimmedWords[4],
    word_6: trimmedWords[5],
    word_7: trimmedWords[6],
    word_8: trimmedWords[7],
    created_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
