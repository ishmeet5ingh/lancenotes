import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { updateNoteAccess } from "@/lib/store";

type RouteContext = {
  params: Promise<{ id: string; noteId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(currentUser)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id, noteId } = await context.params;

  try {
    const body = (await request.json()) as { userId?: string; hasAccess?: boolean };
    if (!body.userId) {
      return NextResponse.json({ error: "User is required" }, { status: 400 });
    }

    const project = await updateNoteAccess(id, noteId, body.userId, Boolean(body.hasAccess));
    if (!project) return NextResponse.json({ error: "Note not found" }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update note access" }, { status: 400 });
  }
}
