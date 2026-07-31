import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canViewProject, isAdmin, projectForUser } from "@/lib/permissions";
import { deleteProject, getProject, updateProject } from "@/lib/store";
import type { ProjectInput } from "@/lib/types";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const { id } = await context.params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!canViewProject(user, project)) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  return NextResponse.json({ project: projectForUser(user, project), user });
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await context.params;
  try {
    const body = (await request.json()) as Partial<ProjectInput>;
    const project = await updateProject(id, body);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ project });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to update project" }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await context.params;
  const deleted = await deleteProject(id);
  if (!deleted) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
