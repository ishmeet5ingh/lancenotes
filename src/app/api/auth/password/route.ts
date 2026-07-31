import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { changeOwnPassword } from "@/lib/store";

export async function PATCH(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const body = (await request.json()) as { currentPassword?: string; newPassword?: string };
    const changed = await changeOwnPassword(user._id, body.currentPassword ?? "", body.newPassword ?? "");
    if (!changed) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to change password" }, { status: 400 });
  }
}
