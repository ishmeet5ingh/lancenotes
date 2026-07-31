"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, Search, UserRound } from "lucide-react";
import { EmptyState } from "./empty-state";
import { friendlyDateTime } from "@/lib/format";
import type { Project, User } from "@/lib/types";

export function UsersClient() {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch("/api/users")
      .then((response) => response.json())
      .then((data) => {
        const regularUsers = ((data.users ?? []) as User[]).filter((user) => user.role === "user");
        setUsers(regularUsers);
        setSelectedUserId(regularUsers[0]?._id ?? "");
      })
      .finally(() => setLoadingUsers(false));
  }, []);

  useEffect(() => {
    if (!selectedUserId) {
      setProjects([]);
      return;
    }

    setLoadingProjects(true);
    fetch(`/api/users/${selectedUserId}/projects`)
      .then((response) => response.json())
      .then((data) => setProjects(data.projects ?? []))
      .finally(() => setLoadingProjects(false));
  }, [selectedUserId]);

  const filteredUsers = useMemo(() => {
    const term = search.trim().toLowerCase();
    return users.filter((user) => !term || user.displayName.toLowerCase().includes(term) || user.username.toLowerCase().includes(term));
  }, [search, users]);

  const selectedUser = users.find((user) => user._id === selectedUserId);

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <Link href="/projects" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-ink">
            <ArrowLeft size={15} />
            Notes
          </Link>
          <h1 className="text-2xl font-black tracking-tight text-ink sm:text-3xl">Users</h1>
          <p className="mt-1 text-sm text-slate-500">Review private note spaces created by users.</p>
        </div>
      </div>

      <div className="grid min-h-[65vh] gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="surface overflow-hidden">
          <div className="border-b border-line p-3">
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input className="field pl-9" placeholder="Search users" value={search} onChange={(event) => setSearch(event.target.value)} />
            </label>
          </div>

          <div className="max-h-[60vh] overflow-y-auto p-2">
            {loadingUsers ? (
              <div className="grid h-40 place-items-center">
                <Loader2 className="animate-spin text-slate-400" size={22} />
              </div>
            ) : filteredUsers.length ? (
              <div className="space-y-1">
                {filteredUsers.map((user) => (
                  <button
                    key={user._id}
                    type="button"
                    onClick={() => setSelectedUserId(user._id)}
                    className={`w-full rounded-md border px-2.5 py-2 text-left transition ${
                      selectedUserId === user._id ? "border-line bg-white shadow-sm" : "border-transparent hover:bg-white"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="grid size-7 shrink-0 place-items-center rounded-md border border-line bg-slate-50 text-slate-500">
                        <UserRound size={15} />
                      </span>
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-black text-ink">{user.displayName}</span>
                        <span className="block truncate text-xs font-semibold text-slate-500">{user.username}</span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="p-4 text-center text-sm font-semibold text-slate-500">No users found.</p>
            )}
          </div>
        </aside>

        <section className="surface overflow-hidden">
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-3">
            <div className="min-w-0">
              <h2 className="truncate text-lg font-black text-ink">{selectedUser?.displayName ?? "User notes"}</h2>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">{projects.length} private note spaces</p>
            </div>
          </div>

          {loadingProjects ? (
            <div className="grid h-64 place-items-center">
              <Loader2 className="animate-spin text-slate-400" size={24} />
            </div>
          ) : projects.length ? (
            <div>
              {projects.map((project) => {
                const lastNote = [...project.notes].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];
                return (
                  <article key={project._id} className="flex flex-col gap-3 border-b border-line px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="grid size-8 shrink-0 place-items-center rounded-md border border-blue-100 bg-blue-50 text-brand">
                        <FileText size={16} />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-black text-ink">{project.title}</h3>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500">
                          {project.notes.length} notes{lastNote ? ` · updated ${friendlyDateTime(lastNote.updatedAt)}` : ""}
                        </p>
                      </div>
                    </div>
                    <Link href={`/projects/${project._id}`} className="rounded-md px-2.5 py-1.5 text-xs font-bold text-brand transition hover:bg-blue-50">
                      Open
                    </Link>
                  </article>
                );
              })}
            </div>
          ) : selectedUser ? (
            <div className="p-4">
              <EmptyState title="No private notes yet" action={false} />
            </div>
          ) : (
            <div className="p-4">
              <EmptyState title="Select a user" action={false} />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
