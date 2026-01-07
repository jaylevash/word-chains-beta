import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
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
  } = await request.json();

  const words = [word_1, word_2, word_3, word_4, word_5, word_6, word_7, word_8];
  const hasAllWords = words.every(
    (word) => typeof word === "string" && word.trim().length > 0
  );

  if (!user_id || !hasAllWords) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("puzzle_suggestions").insert({
    user_id,
    user_name: user_name ?? null,
    word_1: word_1.trim(),
    word_2: word_2.trim(),
    word_3: word_3.trim(),
    word_4: word_4.trim(),
    word_5: word_5.trim(),
    word_6: word_6.trim(),
    word_7: word_7.trim(),
    word_8: word_8.trim(),
    created_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
