import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canAddNote, projectForUser } from "@/lib/permissions";
import { addNote, getProject, lineMetaForUser, normalizedLineMetaForDescription } from "@/lib/store";
import type { NoteInput } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { id } = await context.params;
  try {
    const existingProject = await getProject(id);
    if (!existingProject) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!canAddNote(user, existingProject)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const body = (await request.json()) as NoteInput;
    const project = await addNote(id, {
      ...body,
      createdByUserId: user._id,
      createdByUserName: user.displayName || user.username,
      createdByUserRole: user.role,
      lineMeta: normalizedLineMetaForDescription(body.description ?? "", body.lineMeta).map(() => lineMetaForUser(user))
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ project: projectForUser(user, project) }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to add note" }, { status: 400 });
  }
}
