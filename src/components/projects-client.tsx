"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Eye, EyeOff, FileText, FolderInput, Loader2, Plus, Search, Shield, UserPlus, X } from "lucide-react";
import { EmptyState } from "./empty-state";
import { friendlyDateTime } from "@/lib/format";
import type { AuthUser, Project, User } from "@/lib/types";

export function ProjectsClient() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moveProjectId, setMoveProjectId] = useState<string | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);
  const [accessProject, setAccessProject] = useState<Project | null>(null);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [accessSavingUserId, setAccessSavingUserId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [testingFirebase, setTestingFirebase] = useState(false);
  const [previewingMigration, setPreviewingMigration] = useState(false);
  const [migratingFirebase, setMigratingFirebase] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);

  useEffect(() => {
    fetch("/api/projects")
      .then((response) => response.json())
      .then((data) => {
        setProjects(data.projects ?? []);
        setUser(data.user ?? null);
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return projects
      .filter((project) => !term || project.title.toLowerCase().includes(term))
      .sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [projects, search]);

  function startMove(project: Project) {
    if (user?.role !== "admin") return;
    const firstTarget = projects.find((item) => item._id !== project._id);
    setMoveProjectId(project._id);
    setMoveTargetId(firstTarget?._id ?? "");
  }

  async function moveProject(projectId: string) {
    if (!moveTargetId) return;

    setMovingProjectId(projectId);
    const response = await fetch(`/api/projects/${projectId}/move`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ targetProjectId: moveTargetId })
    });
    const data = (await response.json()) as { projects?: Project[]; error?: string };
    setMovingProjectId(null);

    if (!response.ok) {
      alert(data.error ?? "Unable to move title");
      return;
    }

    setProjects(data.projects ?? []);
    setMoveProjectId(null);
    setMoveTargetId("");
  }

  async function loadUsers() {
    if (user?.role !== "admin") return;
    setLoadingUsers(true);
    const response = await fetch("/api/users");
    const data = (await response.json()) as { users?: User[]; error?: string };
    setLoadingUsers(false);

    if (!response.ok) {
      alert(data.error ?? "Unable to load users");
      return;
    }

    setUsers(data.users ?? []);
  }

  function openAccess(project: Project) {
    setAccessProject(project);
    setUsersModalOpen(true);
    void loadUsers();
  }

  async function createSharedUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setCreatingUser(true);

    const response = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: newUserId,
        displayName: newUserName,
        password: newUserPassword
      })
    });
    const data = (await response.json()) as { user?: User; error?: string };
    setCreatingUser(false);

    if (!response.ok || !data.user) {
      alert(data.error ?? "Unable to create user");
      return;
    }

    setUsers((current) => [...current, data.user as User].sort((a, b) => a.displayName.localeCompare(b.displayName)));
    setNewUserId("");
    setNewUserName("");
    setNewUserPassword("");
  }

  async function updateAccess(project: Project, accessUser: User, hasAccess: boolean) {
    setAccessSavingUserId(accessUser._id);
    const response = await fetch(`/api/projects/${project._id}/access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: accessUser._id, hasAccess })
    });
    const data = (await response.json()) as { project?: Project; error?: string };
    setAccessSavingUserId(null);

    if (!response.ok || !data.project) {
      alert(data.error ?? "Unable to update access");
      return;
    }

    setProjects((current) => current.map((item) => (item._id === data.project?._id ? data.project : item)));
    setAccessProject(data.project);
  }

  async function runFirebaseTest() {
    setTestingFirebase(true);
    const response = await fetch("/api/firebase/test", { method: "POST" });
    const data = (await response.json()) as {
      ok?: boolean;
      path?: string;
      checks?: {
        readBackMatches?: boolean;
        updatedStatus?: string;
        deleted?: boolean;
      };
      error?: string;
    };
    setTestingFirebase(false);

    if (!response.ok || !data.ok) {
      alert(data.error ?? "Firebase test failed");
      return;
    }

    alert(
      `Firebase test passed.\nPath: ${data.path}\nRead: ${data.checks?.readBackMatches ? "ok" : "failed"}\nUpdate: ${data.checks?.updatedStatus}\nDelete: ${data.checks?.deleted ? "ok" : "failed"}`
    );
  }

  async function runMigrationPreview() {
    setPreviewingMigration(true);
    const response = await fetch("/api/firebase/migration-preview", { method: "POST" });
    const data = (await response.json()) as {
      ok?: boolean;
      path?: string;
      counts?: {
        projects: number;
        notes: number;
        lines: number;
        users: number;
      };
      error?: string;
    };
    setPreviewingMigration(false);

    if (!response.ok || !data.ok) {
      alert(data.error ?? "Firebase migration preview failed");
      return;
    }

    alert(
      `Migration preview copied to Firebase.\nPath: ${data.path}\nProjects: ${data.counts?.projects}\nNotes: ${data.counts?.notes}\nLines: ${data.counts?.lines}\nUsers: ${data.counts?.users}`
    );
  }

  async function migrateToFirebaseApp() {
    if (!confirm("Copy local data to /lancenotes_app in Firebase? Local data will remain untouched. App storage will not switch until you set DATA_BACKEND=firebase.")) {
      return;
    }

    setMigratingFirebase(true);
    const response = await fetch("/api/firebase/migrate-app", { method: "POST" });
    const data = (await response.json()) as {
      ok?: boolean;
      path?: string;
      counts?: {
        projects: number;
        notes: number;
        lines: number;
        users: number;
      };
      error?: string;
    };
    setMigratingFirebase(false);

    if (!response.ok || !data.ok) {
      alert(data.error ?? "Firebase migration failed");
      return;
    }

    alert(
      `Firebase app data migrated.\nPath: ${data.path}\nProjects: ${data.counts?.projects}\nNotes: ${data.counts?.notes}\nLines: ${data.counts?.lines}\nUsers: ${data.counts?.users}\n\nSet DATA_BACKEND=firebase in .env.local and restart to use Firebase storage.`
    );
  }

  const isAdmin = user?.role === "admin";
  const sharedUsers = users.filter((item) => item.role === "user");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">Notes</h1>
          <p className="mt-1 text-sm text-slate-500">{isAdmin ? "Create a title, open it, and start writing." : "Open an assigned title and add your notes."}</p>
        </div>
        {isAdmin ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setUsersModalOpen(true);
                void loadUsers();
              }}
            >
              <UserPlus size={16} />
              Users
            </button>
            <button type="button" className="btn-secondary" onClick={() => void runFirebaseTest()} disabled={testingFirebase}>
              {testingFirebase ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
              Firebase test
            </button>
            <button type="button" className="btn-secondary" onClick={() => void runMigrationPreview()} disabled={previewingMigration}>
              {previewingMigration ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
              Migration preview
            </button>
            <button type="button" className="btn-secondary" onClick={() => void migrateToFirebaseApp()} disabled={migratingFirebase}>
              {migratingFirebase ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
              Migrate to Firebase
            </button>
            <Link href="/projects/new" className="btn-primary">
              <Plus size={16} />
              New
            </Link>
          </div>
        ) : null}
      </div>

      <label className="relative block">
        <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
        <input className="field pl-9" placeholder="Search titles" value={search} onChange={(event) => setSearch(event.target.value)} />
      </label>

      {!loading && !filtered.length ? (
        <EmptyState title="No notes yet" />
      ) : (
        <section className="overflow-hidden rounded-md border border-line bg-white shadow-sm">
          {filtered.map((project) => {
            const lastNote = [...project.notes].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];
            const moveTargets = projects.filter((item) => item._id !== project._id);
            const isMovingThis = movingProjectId === project._id;
            return (
              <article key={project._id} className="flex flex-col gap-3 border-b border-line px-3 py-3 last:border-b-0 transition hover:bg-slate-50/80 sm:flex-row sm:items-center sm:justify-between">
                <Link href={`/projects/${project._id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border border-blue-100 bg-blue-50 text-brand">
                    <FileText size={16} />
                  </span>
                  <div className="min-w-0">
                    <h2 className="truncate text-sm font-black text-ink">{project.title}</h2>
                    <p className="mt-0.5 text-xs font-semibold text-slate-500">
                      {project.notes.length} notes{lastNote ? ` · updated ${friendlyDateTime(lastNote.updatedAt)}` : ""}
                    </p>
                  </div>
                </Link>
                {isAdmin && moveProjectId === project._id ? (
                  <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
                    <select
                      className="field min-w-44 flex-1 py-2 text-xs sm:flex-none"
                      value={moveTargetId}
                      onChange={(event) => setMoveTargetId(event.target.value)}
                      disabled={isMovingThis}
                    >
                      {moveTargets.map((target) => (
                        <option key={target._id} value={target._id}>
                          {target.title}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => void moveProject(project._id)}
                      disabled={!moveTargetId || isMovingThis}
                      className="btn-primary px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Move into selected title"
                    >
                      {isMovingThis ? <Loader2 className="animate-spin" size={15} /> : <Check size={15} />}
                      Move
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setMoveProjectId(null);
                        setMoveTargetId("");
                      }}
                      disabled={isMovingThis}
                      className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-white text-slate-500 shadow-sm transition hover:bg-slate-50 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                      title="Cancel move"
                    >
                      <X size={15} />
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center justify-end gap-3">
                    {isAdmin ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openAccess(project)}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-ink"
                          title="Manage access"
                        >
                          <Shield size={15} />
                          Access
                        </button>
                        <button
                          type="button"
                          onClick={() => startMove(project)}
                          disabled={moveTargets.length === 0}
                          className="inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                          title="Move into another title"
                        >
                          <FolderInput size={15} />
                          Move
                        </button>
                      </>
                    ) : null}
                    <Link href={`/projects/${project._id}`} className="rounded-md px-2.5 py-1.5 text-xs font-bold text-brand transition hover:bg-blue-50">
                      Open
                    </Link>
                  </div>
                )}
              </article>
            );
          })}
        </section>
      )}

      {isAdmin && usersModalOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4">
          <div className="w-full max-w-2xl rounded-md bg-white shadow-lift">
            <div className="flex items-start justify-between gap-4 border-b border-line p-4">
              <div>
                <h2 className="text-lg font-black text-ink">{accessProject ? `Access: ${accessProject.title}` : "Users"}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Create IDs and assign note access.</p>
              </div>
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink"
                onClick={() => {
                  setAccessProject(null);
                  setUsersModalOpen(false);
                  setUsers([]);
                }}
                title="Close"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[75vh] overflow-y-auto p-4">
              <form onSubmit={createSharedUser} className="grid gap-2 rounded-md border border-line bg-cloud p-3 sm:grid-cols-[1fr_1fr_1fr_auto]">
                <input className="field py-2" placeholder="user-id" value={newUserId} onChange={(event) => setNewUserId(event.target.value)} required />
                <input className="field py-2" placeholder="Name" value={newUserName} onChange={(event) => setNewUserName(event.target.value)} />
                <span className="relative block">
                  <input
                    className="field py-2 pr-10"
                    placeholder="Password"
                    type={showNewUserPassword ? "text" : "password"}
                    value={newUserPassword}
                    onChange={(event) => setNewUserPassword(event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUserPassword((current) => !current)}
                    className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-ink"
                    title={showNewUserPassword ? "Hide password" : "Show password"}
                  >
                    {showNewUserPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </span>
                <button className="btn-primary px-3 py-2" disabled={creatingUser}>
                  {creatingUser ? <Loader2 className="animate-spin" size={15} /> : <UserPlus size={15} />}
                  Add
                </button>
              </form>

              <div className="mt-4 grid gap-2">
                {loadingUsers ? (
                  <div className="grid h-24 place-items-center">
                    <Loader2 className="animate-spin text-slate-400" size={22} />
                  </div>
                ) : sharedUsers.length ? (
                  sharedUsers.map((accessUser) => {
                    const checked = Boolean(accessProject?.sharedWith?.includes(accessUser._id));
                    return (
                      <label key={accessUser._id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-white p-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-ink">{accessUser.displayName}</span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{accessUser.username}</span>
                        </span>
                        {accessProject ? (
                          <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-600">
                            {accessSavingUserId === accessUser._id ? <Loader2 className="animate-spin" size={15} /> : null}
                            <input
                              type="checkbox"
                              className="size-4 accent-blue-600"
                              checked={checked}
                              disabled={accessSavingUserId === accessUser._id}
                              onChange={(event) => void updateAccess(accessProject, accessUser, event.target.checked)}
                            />
                          </span>
                        ) : null}
                      </label>
                    );
                  })
                ) : (
                  <p className="rounded-md border border-dashed border-line p-5 text-center text-sm font-semibold text-slate-500">No shared users yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
