import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";

const parseOriginAllowlist = () => {
  const raw = process.env.ALLOWED_ORIGINS ?? "";
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
};

const allowedOrigins = parseOriginAllowlist();

export const getClientIp = (request: Request) => {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    return forwarded.split(",")[0]?.trim() ?? "unknown";
  }
  return (
    request.headers.get("x-real-ip") ??
    request.headers.get("cf-connecting-ip") ??
    "unknown"
  );
};

export const enforceOrigin = (request: Request) => {
  if (!allowedOrigins.length) return null;
  const origin = request.headers.get("origin");
  if (!origin) return null;
  const isAllowed = allowedOrigins.includes(origin);
  if (isAllowed) return null;
  return NextResponse.json({ error: "origin_not_allowed" }, { status: 403 });
};

export const enforceJson = (request: Request) => {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return NextResponse.json({ error: "invalid_content_type" }, { status: 415 });
  }
  return null;
};

export const enforceRateLimit = async ({
  request,
  key,
  limit,
  windowSeconds,
}: {
  request: Request;
  key: string;
  limit: number;
  windowSeconds: number;
}) => {
  const ip = getClientIp(request);
  const result = await rateLimit(`${key}:${ip}`, limit, windowSeconds);
  if (result.success) return null;
  const response = NextResponse.json({ error: "rate_limited" }, { status: 429 });
  response.headers.set("X-RateLimit-Remaining", String(result.remaining));
  response.headers.set("X-RateLimit-Reset", String(result.reset));
  return response;
};

export const clampText = (
  value: string | null | undefined,
  maxLength: number
) => {
  if (!value) return "";
  return value.trim().slice(0, maxLength);
};
