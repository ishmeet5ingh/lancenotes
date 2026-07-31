import { NextResponse } from "next/server";
import { clearedSessionCookieOptions, sessionCookieName } from "@/lib/auth";

export async function POST() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, "", clearedSessionCookieOptions());
  return response;
}
