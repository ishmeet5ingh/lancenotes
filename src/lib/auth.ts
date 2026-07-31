import nodeCrypto from "crypto";
import { cookies } from "next/headers";
import { getUserById } from "./store";
import type { AuthUser } from "./types";

export const sessionCookieName = "lancenotes_session";

const sessionMaxAgeSeconds = 60 * 60 * 24 * 30;

function getSessionSecret() {
  return process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "lancenotes-local-dev-secret-change-me";
}

function base64UrlEncode(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return nodeCrypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

export function createSessionToken(user: AuthUser) {
  const payload = base64UrlEncode(
    JSON.stringify({
      id: user._id,
      username: user.username,
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + sessionMaxAgeSeconds
    })
  );
  return `${payload}.${sign(payload)}`;
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(sessionCookieName)?.value;
  if (!token) return null;

  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return null;

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as {
      id?: string;
      exp?: number;
    };
    if (!parsed.id || !parsed.exp || parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return getUserById(parsed.id);
  } catch {
    return null;
  }
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: sessionMaxAgeSeconds
  };
}

export function clearedSessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0
  };
}
