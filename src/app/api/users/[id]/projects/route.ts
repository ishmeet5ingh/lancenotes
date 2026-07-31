import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin, isUserOwnedProject } from "@/lib/permissions";
import { getUserById, listProjects } from "@/lib/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const currentUser = await getCurrentUser();
  if (!currentUser) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(currentUser)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const { id } = await context.params;
  const user = await getUserById(id);
  if (!user || user.role !== "user") return NextResponse.json({ error: "User not found" }, { status: 404 });

  const projects = (await listProjects()).filter((project) => isUserOwnedProject(project) && project.ownerUserId === user._id);

  return NextResponse.json({ user, projects });
}
