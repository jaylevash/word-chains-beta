import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const { user_id, user_name, suggestion } = await request.json();

  if (!user_id || !suggestion) {
    return NextResponse.json({ error: "missing fields" }, { status: 400 });
  }

  const { error } = await supabaseAdmin.from("puzzle_suggestions").insert({
    user_id,
    user_name: user_name ?? null,
    suggestion,
    created_at: new Date().toISOString(),
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
