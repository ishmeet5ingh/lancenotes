import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createFirebaseMigrationPreviewPath, firebaseTestRequest } from "@/lib/firebase-rtdb";
import { isAdmin } from "@/lib/permissions";
import { listProjects, listUsers } from "@/lib/store";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const path = createFirebaseMigrationPreviewPath();

  try {
    const [projects, users] = await Promise.all([listProjects(), listUsers()]);
    const totalNotes = projects.reduce((count, project) => count + project.notes.length, 0);
    const totalLines = projects.reduce(
      (count, project) =>
        count +
        project.notes.reduce((noteCount, note) => noteCount + (note.description.length ? note.description.split("\n").length : 1), 0),
      0
    );
    const payload = {
      metadata: {
        source: "lancenotes-local-migration-preview",
        createdAt: new Date().toISOString(),
        warning: "Preview copy only. App storage has not been switched to Firebase."
      },
      counts: {
        projects: projects.length,
        notes: totalNotes,
        lines: totalLines,
        users: users.length
      },
      users,
      projects
    };

    await firebaseTestRequest(path, {
      method: "PUT",
      body: JSON.stringify(payload)
    });
    const readBack = await firebaseTestRequest<typeof payload>(path);
    const checks = {
      projectsMatch: readBack.counts.projects === payload.counts.projects,
      notesMatch: readBack.counts.notes === payload.counts.notes,
      linesMatch: readBack.counts.lines === payload.counts.lines,
      usersMatch: readBack.counts.users === payload.counts.users
    };

    return NextResponse.json({
      ok: Object.values(checks).every(Boolean),
      path: `/${path}`,
      counts: payload.counts,
      checks
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        path: `/${path}`,
        error: error instanceof Error ? error.message : "Firebase migration preview failed"
      },
      { status: 500 }
    );
  }
}
