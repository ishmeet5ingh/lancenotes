import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canViewProject, isAdmin, isUserOwnedProject, projectForUser } from "@/lib/permissions";
import { createProject, listProjects } from "@/lib/store";
import type { ProjectInput } from "@/lib/types";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const projects = (await listProjects())
      .filter((project) => canViewProject(user, project))
      .filter((project) => !isAdmin(user) || !isUserOwnedProject(project))
      .map((project) => projectForUser(user, project));
    return NextResponse.json({ projects, user });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load projects" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  try {
    const body = (await request.json()) as ProjectInput;
    const project = await createProject(body, isAdmin(user) ? undefined : user);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to create project" }, { status: 400 });
  }
}
