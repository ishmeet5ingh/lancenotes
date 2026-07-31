import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { listProjects, moveProjectIntoProject } from "@/lib/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await context.params;

  try {
    const body = (await request.json()) as { targetProjectId?: string };
    if (!body.targetProjectId) {
      return NextResponse.json({ error: "Choose a title to move into" }, { status: 400 });
    }

    const project = await moveProjectIntoProject(id, body.targetProjectId);
    if (!project) return NextResponse.json({ error: "Title not found" }, { status: 404 });

    const projects = await listProjects();
    return NextResponse.json({ project, projects });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to move title" }, { status: 400 });
  }
}
