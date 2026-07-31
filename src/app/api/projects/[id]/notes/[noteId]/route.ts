import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canContributeToNote, canEditLine, canEditNote, canViewNote, canViewProject, projectForUser } from "@/lib/permissions";
import { deleteNote, getProject, lineMetaForUser, normalizedLineMetaForDescription, updateNote } from "@/lib/store";
import type { NoteInput, NoteLineMeta } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string; noteId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { id, noteId } = await context.params;
  try {
    const existingProject = await getProject(id);
    if (!existingProject) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!canViewProject(user, existingProject)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const note = existingProject.notes.find((item) => item._id === noteId);
    if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
    if (!canViewNote(user, note, existingProject)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

    const body = (await request.json()) as Partial<NoteInput>;
    const isNoteLevelUpdate =
      body.title !== undefined ||
      body.type !== undefined ||
      body.manualDateTime !== undefined ||
      body.followUpDateTime !== undefined ||
      body.images !== undefined ||
      body.tags !== undefined ||
      body.pinned !== undefined;
    const isDescriptionUpdate = body.description !== undefined;

    if (isNoteLevelUpdate && !canEditNote(user, note)) {
      return NextResponse.json({ error: "You can only edit notes you created" }, { status: 403 });
    }
    if (isDescriptionUpdate && !canContributeToNote(user, note, existingProject)) {
      return NextResponse.json({ error: "You do not have access to add points to this note" }, { status: 403 });
    }

    let nextLineMeta: NoteLineMeta[] | undefined;
    if (isDescriptionUpdate) {
      const previousLines = note.description.length ? note.description.split("\n") : [""];
      const previousMeta = normalizedLineMetaForDescription(note.description, note.lineMeta);
      const previousById = new Map(previousMeta.map((meta, index) => [meta.id, { meta, line: previousLines[index] ?? "" }]));
      const nextLines = (body.description ?? "").length ? (body.description ?? "").split("\n") : [""];
      const requestedMeta = normalizedLineMetaForDescription(body.description ?? "", body.lineMeta);
      const usedPreviousIds = new Set<string>();
      let linePermissionError = "";

      nextLineMeta = requestedMeta.map((meta, index) => {
        const previous = previousById.get(meta.id);
        if (!previous) {
          const created = lineMetaForUser(user);
          return {
            ...created,
            id: meta.id.startsWith("legacy-") ? created.id : meta.id
          };
        }

        usedPreviousIds.add(meta.id);
        const nextLine = nextLines[index] ?? "";
        if (!canEditLine(user, previous.meta) && nextLine !== previous.line) {
          linePermissionError = "You can only edit points you created";
        }
        return previous.meta;
      });

      for (const previous of previousMeta) {
        if (!usedPreviousIds.has(previous.id) && !canEditLine(user, previous)) {
          linePermissionError = "You can only delete points you created";
        }
      }

      if (linePermissionError) {
        return NextResponse.json({ error: linePermissionError }, { status: 403 });
      }
    }

    const update: Partial<NoteInput> = {
      title: body.title,
      description: body.description,
      type: body.type,
      manualDateTime: body.manualDateTime,
      followUpDateTime: body.followUpDateTime,
      images: body.images,
      tags: body.tags,
      pinned: body.pinned,
      lineMeta: nextLineMeta
    };
    const safeUpdate = Object.fromEntries(Object.entries(update).filter(([, value]) => value !== undefined)) as Partial<NoteInput>;
    const project = await updateNote(id, noteId, safeUpdate);
    if (!project) return NextResponse.json({ error: "Note not found" }, { status: 404 });
    return NextResponse.json({ project: projectForUser(user, project) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update note" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { id, noteId } = await context.params;
  const existingProject = await getProject(id);
  if (!existingProject) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!canViewProject(user, existingProject)) return NextResponse.json({ error: "Access denied" }, { status: 403 });

  const note = existingProject.notes.find((item) => item._id === noteId);
  if (!note) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  if (!canEditNote(user, note)) return NextResponse.json({ error: "You can only delete notes you created" }, { status: 403 });

  const project = await deleteNote(id, noteId);
  if (!project) return NextResponse.json({ error: "Note not found" }, { status: 404 });
  return NextResponse.json({ project: projectForUser(user, project) });
}
