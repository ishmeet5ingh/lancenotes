import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { createUser, listUsers } from "@/lib/store";

export async function GET() {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(currentUser)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const users = await listUsers();
  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(currentUser)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  try {
    const body = (await request.json()) as { username?: string; displayName?: string; password?: string };
    const user = await createUser({
      username: body.username ?? "",
      displayName: body.displayName,
      password: body.password ?? "",
      role: "user"
    });
    return NextResponse.json({ user }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create user" }, { status: 400 });
  }
}
