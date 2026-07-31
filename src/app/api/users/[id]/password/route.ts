import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { resetUserPassword } from "@/lib/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(currentUser)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  try {
    const { id } = await context.params;
    const body = (await request.json()) as { newPassword?: string };
    const user = await resetUserPassword(id, body.newPassword ?? "");
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to reset password" }, { status: 400 });
  }
}
