import { NextResponse } from "next/server";
import { createSessionToken, sessionCookieName, sessionCookieOptions } from "@/lib/auth";
import { verifyUserCredentials } from "@/lib/store";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as { username?: unknown; password?: unknown } | null;
  const username = typeof body?.username === "string" ? body.username : "";
  const password = typeof body?.password === "string" ? body.password : "";

  const user = await verifyUserCredentials(username, password);
  if (!user) {
    return NextResponse.json({ error: "Invalid user ID or password" }, { status: 401 });
  }

  const response = NextResponse.json({ user });
  response.cookies.set(sessionCookieName, createSessionToken(user), sessionCookieOptions());
  return response;
}
