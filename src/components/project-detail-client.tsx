"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, ChevronDown, ChevronRight, Edit3, Eye, EyeOff, FilePlus2, GripVertical, Heading2, ImageIcon, ListPlus, Loader2, Shield, Trash2, UserPlus, X } from "lucide-react";
import { EmptyState } from "./empty-state";
import { friendlyDateTime, cn } from "@/lib/format";
import type { AuthUser, Note, NoteLineMeta, Project, User } from "@/lib/types";

function createLineMeta(user: AuthUser): NoteLineMeta {
  return {
    id: crypto.randomUUID(),
    createdByUserId: user._id,
    createdByUserName: user.displayName || user.username,
    createdByUserRole: user.role,
    createdAt: new Date().toISOString()
  };
}

function adminLineMeta(index: number): NoteLineMeta {
  return {
    id: `legacy-${index}`,
    createdByUserName: "Admin",
    createdByUserRole: "admin",
    createdAt: "legacy"
  };
}

function normalizeLineMeta(description: string, lineMeta?: NoteLineMeta[]) {
  const lineCount = description.length ? description.split("\n").length : 1;
  return Array.from({ length: lineCount }, (_, index) => {
    const current = lineMeta?.[index];
    return current?.id ? current : { ...(current ?? adminLineMeta(index)), id: current?.id ?? `legacy-${index}` };
  });
}

function canEditNoteForUser(user: AuthUser | null, note: Note | undefined) {
  if (!user || !note) return false;
  if (user.role === "admin") return note.createdByUserRole !== "user";
  return note.createdByUserId === user._id;
}

function canContributeToNoteForUser(user: AuthUser | null, project: Project | null, note: Note | undefined) {
  if (!user || !project || !note) return false;
  if (user.role === "admin") return true;
  return note.createdByUserId === user._id || (note.sharedWith ?? []).includes(user._id) || (project.sharedWith ?? []).includes(user._id);
}

function canEditLineForUser(user: AuthUser | null, lineMeta?: NoteLineMeta) {
  if (!user) return false;
  if (!lineMeta || lineMeta.createdByUserRole !== "user") return user.role === "admin";
  return lineMeta.createdByUserId === user._id;
}

function noteUpdatedAtMs(note: Note | undefined) {
  const time = note?.updatedAt ? Date.parse(note.updatedAt) : 0;
  return Number.isFinite(time) ? time : 0;
}

function projectUpdatedAtMs(project: Project | null | undefined) {
  const time = project?.updatedAt ? Date.parse(project.updatedAt) : 0;
  return Number.isFinite(time) ? time : 0;
}

function mergeProjectSnapshot(current: Project | null, incoming: Project) {
  if (!current || current._id !== incoming._id) return incoming;

  const currentNotes = new Map(current.notes.map((note) => [note._id, note]));
  const incomingNoteIds = new Set(incoming.notes.map((note) => note._id));
  const notes = incoming.notes.map((note) => {
    const currentNote = currentNotes.get(note._id);
    return currentNote && noteUpdatedAtMs(currentNote) > noteUpdatedAtMs(note) ? currentNote : note;
  });

  if (projectUpdatedAtMs(current) > projectUpdatedAtMs(incoming)) {
    for (const note of current.notes) {
      if (!incomingNoteIds.has(note._id)) notes.push(note);
    }
  }

  return {
    ...incoming,
    updatedAt: projectUpdatedAtMs(current) > projectUpdatedAtMs(incoming) ? current.updatedAt : incoming.updatedAt,
    notes
  };
}

function lineMetaFingerprint(value: NoteLineMeta[]) {
  return JSON.stringify(value);
}

export function ProjectDetailClient({ id }: { id: string }) {
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [lineMeta, setLineMeta] = useState<NoteLineMeta[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [users, setUsers] = useState<User[]>([]);
  const [noteAccessOpen, setNoteAccessOpen] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [accessSavingUserId, setAccessSavingUserId] = useState<string | null>(null);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserId, setNewUserId] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [newUserPassword, setNewUserPassword] = useState("");
  const [showNewUserPassword, setShowNewUserPassword] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectedIdRef = useRef<string | null>(null);
  const localDraftRef = useRef(false);
  const draftVersionRef = useRef(0);
  const saveRequestSeqRef = useRef(0);
  const latestProjectRef = useRef<Project | null>(null);
  const latestEditorRef = useRef({
    selectedId: null as string | null,
    title: "",
    description: "",
    lineMetaKey: lineMetaFingerprint([] as NoteLineMeta[])
  });

  useEffect(() => {
    selectedIdRef.current = selectedId;
  }, [selectedId]);

  useEffect(() => {
    latestProjectRef.current = project;
  }, [project]);

  useEffect(() => {
    latestEditorRef.current = {
      selectedId,
      title,
      description,
      lineMetaKey: lineMetaFingerprint(lineMeta)
    };
  }, [description, lineMeta, selectedId, title]);

  const markLocalDraft = useCallback(() => {
    localDraftRef.current = true;
    draftVersionRef.current += 1;
  }, []);

  const syncEditorFromProject = useCallback((nextProject: Project) => {
    const nextNotes = [...(nextProject.notes ?? [])].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
    const currentSelectedId = selectedIdRef.current;
    const currentSelected = currentSelectedId ? nextNotes.find((note) => note._id === currentSelectedId) : null;
    const nextSelected = currentSelected ?? nextNotes[0];

    setSelectedId(nextSelected?._id ?? null);

    if (!nextSelected) {
      localDraftRef.current = false;
      setTitle("");
      setDescription("");
      setLineMeta(normalizeLineMeta(""));
      setSaveStatus("idle");
      return;
    }

    if (!localDraftRef.current || !currentSelected) {
      localDraftRef.current = false;
      setTitle(nextSelected.title);
      setDescription(nextSelected.description);
      setLineMeta(normalizeLineMeta(nextSelected.description, nextSelected.lineMeta));
      setSaveStatus("idle");
    }
  }, []);

  const applyProjectSnapshot = useCallback((nextProject: Project) => {
    const mergedProject = mergeProjectSnapshot(latestProjectRef.current, nextProject);
    latestProjectRef.current = mergedProject;
    setProject(mergedProject);
    syncEditorFromProject(mergedProject);
  }, [syncEditorFromProject]);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((response) => response.json())
      .then((data) => {
        const loaded = data.project ?? null;
        setUser(data.user ?? null);
        if (loaded) applyProjectSnapshot(loaded);
      })
      .finally(() => setLoading(false));
  }, [applyProjectSnapshot, id]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const events = new EventSource(`/api/projects/${id}/stream`);
    events.onmessage = (event) => {
      const data = JSON.parse(event.data) as { project?: Project; deleted?: boolean; error?: string };
      if (data.deleted) {
        router.push("/projects");
        return;
      }
      if (data.error) return;
      if (!data.project) return;

      applyProjectSnapshot(data.project);
      setLoading(false);
    };

    return () => events.close();
  }, [applyProjectSnapshot, id, router]);

  const notes = useMemo(() => {
    return [...(project?.notes ?? [])].sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }, [project]);

  const selected = notes.find((note) => note._id === selectedId);
  const isAdmin = user?.role === "admin";
  const canCreateNoteInProject = Boolean(isAdmin || (user && (project?.sharedWith ?? []).includes(user._id)));
  const selectedCanEditNote = canEditNoteForUser(user, selected);
  const selectedCanContribute = canContributeToNoteForUser(user, project, selected);
  const sharedUsers = users.filter((item) => item.role === "user");

  const persistNote = useCallback(async (noteId: string, nextTitle: string, nextDescription: string, nextLineMeta: NoteLineMeta[]) => {
    if (!project) return false;
    const note = project.notes.find((item) => item._id === noteId);
    if (!note || !canContributeToNoteForUser(user, project, note)) return false;
    const startedDraftVersion = draftVersionRef.current;
    const savedLineMetaKey = lineMetaFingerprint(nextLineMeta);

    const response = await fetch(`/api/projects/${project._id}/notes/${noteId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...(canEditNoteForUser(user, note) ? { title: nextTitle.trim() || "Untitled note" } : {}),
        description: nextDescription,
        lineMeta: nextLineMeta
      })
    });
    const data = await response.json();
    if (!response.ok) {
      alert(data.error ?? "Unable to save note");
      return false;
    }
    const latestEditor = latestEditorRef.current;
    const draftChanged =
      draftVersionRef.current !== startedDraftVersion ||
      latestEditor.selectedId !== noteId ||
      latestEditor.title !== nextTitle ||
      latestEditor.description !== nextDescription ||
      latestEditor.lineMetaKey !== savedLineMetaKey;

    if (!draftChanged) {
      localDraftRef.current = false;
    }
    applyProjectSnapshot(data.project);
    return draftChanged ? "superseded" : "saved";
  }, [applyProjectSnapshot, project, user]);

  useEffect(() => {
    if (!project || !selected || !selectedCanContribute) return;
    if (title === selected.title && description === selected.description && JSON.stringify(lineMeta) === JSON.stringify(normalizeLineMeta(selected.description, selected.lineMeta))) return;

    setSaveStatus("idle");
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    autoSaveTimer.current = setTimeout(async () => {
      const saveRequestSeq = ++saveRequestSeqRef.current;
      setSaving(true);
      setSaveStatus("saving");
      const saved = await persistNote(selected._id, title, description, lineMeta);
      if (saveRequestSeq === saveRequestSeqRef.current) setSaving(false);
      if (!saved) {
        if (saveRequestSeq === saveRequestSeqRef.current) setSaveStatus("error");
        return;
      }
      if (saveRequestSeq !== saveRequestSeqRef.current) return;
      setSaveStatus(saved === "saved" ? "saved" : "idle");
    }, 700);

    return () => {
      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    };
  }, [description, lineMeta, persistNote, project, selected, selectedCanContribute, title]);

  function selectNote(note: Note) {
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    if (project && selected && selectedCanContribute && (title !== selected.title || description !== selected.description)) {
      void persistNote(selected._id, title, description, lineMeta);
    }
    setSelectedId(note._id);
    setTitle(note.title);
    setDescription(note.description);
    setLineMeta(normalizeLineMeta(note.description, note.lineMeta));
    localDraftRef.current = false;
    setSaveStatus("idle");
  }

  async function createNote() {
    if (!project) return;
    setSaving(true);
    const response = await fetch(`/api/projects/${project._id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: "Untitled note",
        description: "",
        type: "General",
        manualDateTime: "",
        followUpDateTime: "",
        images: [],
        tags: [],
        pinned: false
      })
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      alert(data.error ?? "Unable to create note");
      return;
    }
    setProject(data.project);
    const newest = [...data.project.notes].sort((a: Note, b: Note) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    if (newest) selectNote(newest);
  }

  async function moveSectionToNewNote(sectionTitle: string, sectionLines: string[], nextDescription: string, nextLineMeta: NoteLineMeta[]) {
    if (!project || !selected || !selectedCanEditNote) return false;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);

    const nextNoteTitle = sectionTitle.trim() || "Untitled section";
    const nextNoteDescription = sectionLines.slice(1).join("\n").trimStart();

    setSaving(true);
    setSaveStatus("saving");

    const createResponse = await fetch(`/api/projects/${project._id}/notes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: nextNoteTitle,
        description: nextNoteDescription,
        type: "General",
        manualDateTime: "",
        followUpDateTime: "",
        images: [],
        tags: [],
        pinned: false
      })
    });
    const createData = await createResponse.json();

    if (!createResponse.ok) {
      setSaving(false);
      setSaveStatus("error");
      alert(createData.error ?? "Unable to create note from section");
      return false;
    }

    const created = [...createData.project.notes].sort((a: Note, b: Note) => +new Date(b.createdAt) - +new Date(a.createdAt))[0];
    const updateResponse = await fetch(`/api/projects/${project._id}/notes/${selected._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title.trim() || "Untitled note",
        description: nextDescription,
        lineMeta: nextLineMeta
      })
    });
    const updateData = await updateResponse.json();

    setSaving(false);

    if (!updateResponse.ok) {
      setProject(createData.project);
      setSelectedId(created?._id ?? selected._id);
      setTitle(created?.title ?? nextNoteTitle);
      setDescription(created?.description ?? nextNoteDescription);
      setSaveStatus("error");
      alert(updateData.error ?? "Created the new note, but could not remove the section from this note.");
      return false;
    }

    setProject(updateData.project);
    setSelectedId(created?._id ?? selected._id);
    setTitle(created?.title ?? nextNoteTitle);
    setDescription(created?.description ?? nextNoteDescription);
    setLineMeta(normalizeLineMeta(created?.description ?? nextNoteDescription, created?.lineMeta));
    localDraftRef.current = false;
    setSaveStatus("saved");
    return true;
  }

  async function deleteNote() {
    if (!project || !selected || !selectedCanEditNote || !confirm("Delete this note?")) return;
    const response = await fetch(`/api/projects/${project._id}/notes/${selected._id}`, { method: "DELETE" });
    const data = await response.json();
    if (!response.ok) return;
    setProject(data.project);
    const remaining = data.project.notes.filter((note: Note) => note._id !== selected._id);
    const next = remaining.sort((a: Note, b: Note) => +new Date(b.updatedAt) - +new Date(a.updatedAt))[0];
    setSelectedId(next?._id ?? null);
    setTitle(next?.title ?? "");
    setDescription(next?.description ?? "");
    setLineMeta(normalizeLineMeta(next?.description ?? "", next?.lineMeta));
  }

  async function loadUsers() {
    if (!isAdmin) return;
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

  function openNoteAccess() {
    setNoteAccessOpen(true);
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

  async function updateNoteAccess(accessUser: User, hasAccess: boolean) {
    if (!project || !selected) return;
    setAccessSavingUserId(accessUser._id);
    const response = await fetch(`/api/projects/${project._id}/notes/${selected._id}/access`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: accessUser._id, hasAccess })
    });
    const data = (await response.json()) as { project?: Project; error?: string };
    setAccessSavingUserId(null);

    if (!response.ok || !data.project) {
      alert(data.error ?? "Unable to update note access");
      return;
    }

    setProject(data.project);
  }

  async function deleteProject() {
    if (!project || !isAdmin || !confirm("Delete this title and all its notes?")) return;
    const response = await fetch(`/api/projects/${project._id}`, { method: "DELETE" });
    if (response.ok) router.push("/projects");
  }

  if (loading) return <div className="h-full animate-pulse bg-white" />;
  if (!project) return <EmptyState title="Not found" action={false} />;

  return (
    <div className="h-full overflow-hidden border-y border-line bg-white shadow-sm">
      <div className="flex h-full flex-col md:flex-row">
        <aside className="flex h-full shrink-0 flex-col border-b border-line bg-slate-50 md:w-60 md:border-b-0 md:border-r">
          <div className="border-b border-line p-3">
            <Link href="/projects" className="mb-3 inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-ink">
              <ArrowLeft size={15} />
              All notes
            </Link>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-lg font-black text-ink">{project.title}</h1>
                <p className="mt-1 text-xs font-semibold text-slate-500">{notes.length} notes</p>
              </div>
              {isAdmin ? (
                <Link href={`/projects/${project._id}/edit`} className="grid size-8 shrink-0 place-items-center rounded-md border border-line bg-white text-slate-600 shadow-sm" title="Rename">
                  <Edit3 size={15} />
                </Link>
              ) : null}
            </div>
            {canCreateNoteInProject ? (
              <button className="btn-primary mt-3 w-full" onClick={() => void createNote()} disabled={saving}>
                {saving ? <Loader2 className="animate-spin" size={16} /> : <FilePlus2 size={16} />}
                New note
              </button>
            ) : null}
          </div>

          <div className="max-h-72 flex-1 overflow-y-auto p-2 md:max-h-none">
            {notes.length === 0 ? (
              <p className="p-3 text-sm text-slate-500">No notes yet. Create one to start writing.</p>
            ) : (
              <div className="space-y-1">
                {notes.map((note) => {
                  const displayTitle = note._id === selectedId ? title : note.title;
                  return (
                    <button
                      key={note._id}
                      type="button"
                      onClick={() => selectNote(note)}
                      className={cn(
                        "w-full rounded-md px-2.5 py-2 text-left transition",
                        selectedId === note._id ? "border border-line bg-white shadow-sm" : "border border-transparent hover:bg-white"
                      )}
                    >
                      <span className="block truncate text-sm font-black text-ink">{displayTitle || "Untitled note"}</span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{friendlyDateTime(note.updatedAt)}</span>
                      <span className="mt-0.5 block truncate text-[11px] font-semibold text-slate-400">
                        by {note.createdByUserName ?? "Admin"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {isAdmin ? (
            <button onClick={() => void deleteProject()} className="m-2 inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-bold text-rose-600 hover:bg-rose-50">
              <Trash2 size={15} />
              Delete title
            </button>
          ) : null}
        </aside>

        <main className="flex min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2">
                <div className="space-y-0.5">
                  <p className="text-xs font-semibold text-slate-500">Updated {friendlyDateTime(selected.updatedAt)}</p>
                  {selectedCanContribute ? <SaveIndicator status={saveStatus} saving={saving} /> : <span className="text-xs font-bold text-slate-400">Read only</span>}
                </div>
                <div className="flex gap-2">
                  {isAdmin ? (
                    <button className="btn-secondary px-2.5 py-1.5" onClick={openNoteAccess} title="Manage note access">
                      <Shield size={15} />
                    </button>
                  ) : null}
                  {selectedCanEditNote ? (
                    <button className="btn-secondary px-2.5 py-1.5 text-rose-600" onClick={() => void deleteNote()} title="Delete note">
                      <Trash2 size={15} />
                    </button>
                  ) : null}
                </div>
              </div>
              <div className="flex min-h-0 flex-1 flex-col p-4 sm:p-5">
                <input
                  className="w-full border-none bg-transparent text-xl font-black tracking-tight text-ink outline-none placeholder:text-slate-300 sm:text-2xl"
                  value={title}
                  onChange={(event) => {
                    if (selectedCanEditNote) {
                      markLocalDraft();
                      setTitle(event.target.value);
                    }
                  }}
                  readOnly={!selectedCanEditNote}
                  placeholder="Untitled note"
                />
                <ChecklistEditor
                  projectId={project._id}
                  noteId={selected._id}
                  currentUser={user}
                  lineMeta={lineMeta}
                  value={description}
                  onChange={(nextValue, nextLineMeta) => {
                    if (selectedCanContribute) {
                      markLocalDraft();
                      setDescription(nextValue);
                      setLineMeta(nextLineMeta);
                    }
                  }}
                  onMoveSectionToNewNote={moveSectionToNewNote}
                  readOnly={!selectedCanContribute}
                />
              </div>
            </>
          ) : (
            <div className="grid flex-1 place-items-center p-8 text-center">
              <div>
                <h2 className="text-xl font-black text-ink">Start with a note</h2>
                <p className="mt-2 text-sm text-slate-500">Your note titles will appear in the sidebar.</p>
                {canCreateNoteInProject ? (
                  <button className="btn-primary mt-5" onClick={() => void createNote()}>
                    <FilePlus2 size={16} />
                    New note
                  </button>
                ) : null}
              </div>
            </div>
          )}
        </main>
      </div>
      {isAdmin && noteAccessOpen && selected ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/35 p-4">
          <div className="w-full max-w-2xl rounded-md bg-white shadow-lift">
            <div className="flex items-start justify-between gap-4 border-b border-line p-4">
              <div>
                <h2 className="text-lg font-black text-ink">Access: {selected.title}</h2>
                <p className="mt-1 text-sm font-semibold text-slate-500">Assign users who can add their own points in this note.</p>
              </div>
              <button
                type="button"
                className="grid size-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink"
                onClick={() => {
                  setNoteAccessOpen(false);
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
                    const checked = Boolean(selected.sharedWith?.includes(accessUser._id));
                    return (
                      <label key={accessUser._id} className="flex items-center justify-between gap-3 rounded-md border border-line bg-white p-3">
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-black text-ink">{accessUser.displayName}</span>
                          <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{accessUser.username}</span>
                        </span>
                        <span className="inline-flex items-center gap-2 text-sm font-bold text-slate-600">
                          {accessSavingUserId === accessUser._id ? <Loader2 className="animate-spin" size={15} /> : null}
                          <input
                            type="checkbox"
                            className="size-4 accent-blue-600"
                            checked={checked}
                            disabled={accessSavingUserId === accessUser._id}
                            onChange={(event) => void updateNoteAccess(accessUser, event.target.checked)}
                          />
                        </span>
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

function SaveIndicator({ status, saving }: { status: "idle" | "saving" | "saved" | "error"; saving: boolean }) {
  if (status === "saving" || saving) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <Loader2 className="animate-spin" size={13} />
        Saving...
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-600">
        <Check size={13} />
        Saved
      </span>
    );
  }
  if (status === "error") {
    return <span className="text-xs font-bold text-rose-600">Could not save</span>;
  }
  return <span className="text-xs font-semibold text-slate-400">Autosaves when you stop typing</span>;
}

function parseTaskLine(line: string) {
  const match = line.match(/^(\s*)\*\s*(?:\[(x|X| )\]\s*)?(.*)$/);
  if (!match) return null;

  return {
    indent: match[1],
    checked: match[2]?.toLowerCase() === "x",
    text: match[3] ?? ""
  };
}

function formatTaskLine(text: string, checked: boolean, indent = "") {
  return `${indent}* [${checked ? "x" : " "}] ${text}`;
}

type InlineImage = {
  url: string;
  publicId?: string;
  width?: number;
  height?: number;
};

function parseImageLine(line: string): InlineImage | null {
  const match = line.match(/^\s*!\[image\]\((\S+?)(?:\s+"([^"]+)")?\)$/);
  if (!match) return null;

  return {
    url: match[1],
    publicId: match[2]
  };
}

function formatImageLine(image: InlineImage) {
  return `  ![image](${image.url}${image.publicId ? ` "${image.publicId}"` : ""})`;
}

function getClipboardImageFile(event: React.ClipboardEvent<HTMLInputElement>) {
  const items = Array.from(event.clipboardData.items);
  const imageItem = items.find((item) => item.kind === "file" && item.type.startsWith("image/"));
  return imageItem?.getAsFile() ?? null;
}

function parseSectionLine(line: string) {
  const match = line.match(/^##\s*(.*)$/);
  if (!match) return null;

  return {
    text: match[1] ?? ""
  };
}

function formatSectionLine(text: string) {
  return `## ${text}`;
}

function getSectionEnd(lines: string[], startIndex: number) {
  for (let index = startIndex + 1; index < lines.length; index += 1) {
    if (parseSectionLine(lines[index])) return index;
  }

  return lines.length;
}

function getSectionKey(line: string, index: number) {
  return line.trim() || `Untitled section ${index + 1}`;
}

function ChecklistEditor({
  projectId,
  noteId,
  currentUser,
  lineMeta,
  value,
  onChange,
  onMoveSectionToNewNote,
  readOnly = false
}: {
  projectId: string;
  noteId: string;
  currentUser: AuthUser | null;
  lineMeta: NoteLineMeta[];
  value: string;
  onChange: (value: string, lineMeta: NoteLineMeta[]) => void;
  onMoveSectionToNewNote: (sectionTitle: string, sectionLines: string[], nextDescription: string, nextLineMeta: NoteLineMeta[]) => Promise<boolean>;
  readOnly?: boolean;
}) {
  const lines = value.length ? value.split("\n") : [""];
  const normalizedMeta = normalizeLineMeta(value, lineMeta);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [draggedRange, setDraggedRange] = useState<{ start: number; end: number } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ index: number; position: "before" | "after" } | null>(null);
  const [movingSectionIndex, setMovingSectionIndex] = useState<number | null>(null);
  const [uploadingTaskIndex, setUploadingTaskIndex] = useState<number | null>(null);
  const [deletingImageIndex, setDeletingImageIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex === null) return;
    inputRefs.current[focusIndex]?.focus();
  }, [focusIndex, value]);

  function editableLine(index: number) {
    return !readOnly && canEditLineForUser(currentUser, normalizedMeta[index]);
  }

  function ownedLineMeta() {
    return currentUser ? createLineMeta(currentUser) : adminLineMeta(Date.now());
  }

  function commit(nextLines: string[], nextLineMeta: NoteLineMeta[]) {
    if (readOnly) return;
    onChange(nextLines.join("\n"), normalizeLineMeta(nextLines.join("\n"), nextLineMeta));
  }

  function updateLine(index: number, nextLine: string) {
    if (!editableLine(index)) return;
    const nextLines = [...lines];
    nextLines[index] = nextLine;
    setFocusIndex(index);
    commit(nextLines, normalizedMeta);
  }

  function insertLineAfter(index: number, line = "") {
    if (readOnly || !currentUser) return;
    const nextLines = [...lines];
    const nextLineMeta = [...normalizedMeta];
    nextLines.splice(index + 1, 0, line);
    nextLineMeta.splice(index + 1, 0, ownedLineMeta());
    setFocusIndex(index + 1);
    commit(nextLines, nextLineMeta);
  }

  function insertEditorLine(line: string) {
    if (readOnly) return;
    const index = focusIndex ?? Math.max(lines.length - 1, 0);

    if (lines.length === 1 && lines[0] === "") {
      setFocusIndex(0);
      commit([line], [ownedLineMeta()]);
      return;
    }

    insertLineAfter(index, line);
  }

  function removeEmptyLine(index: number) {
    if (!editableLine(index)) return;
    if (lines.length === 1 || lines[index] !== "") return;
    const nextLines = [...lines];
    const nextLineMeta = [...normalizedMeta];
    nextLines.splice(index, 1);
    nextLineMeta.splice(index, 1);
    setFocusIndex(Math.max(index - 1, 0));
    commit(nextLines, nextLineMeta);
  }

  function getDragRange(index: number) {
    if (parseSectionLine(lines[index])) {
      return { start: index, end: getSectionEnd(lines, index) };
    }

    if (parseTaskLine(lines[index])) {
      let end = index + 1;
      while (end < lines.length && parseImageLine(lines[end])) {
        end += 1;
      }
      return { start: index, end };
    }

    return { start: index, end: index + 1 };
  }

  function moveRange(range: { start: number; end: number }, insertIndex: number) {
    if (readOnly) return;
    if (insertIndex >= range.start && insertIndex <= range.end) return;
    if (normalizedMeta.slice(range.start, range.end).some((meta) => !canEditLineForUser(currentUser, meta))) return;

    const movingLines = lines.slice(range.start, range.end);
    const movingMeta = normalizedMeta.slice(range.start, range.end);
    const nextLines = [...lines.slice(0, range.start), ...lines.slice(range.end)];
    const nextLineMeta = [...normalizedMeta.slice(0, range.start), ...normalizedMeta.slice(range.end)];
    const adjustedInsertIndex = insertIndex > range.start ? insertIndex - movingLines.length : insertIndex;
    nextLines.splice(adjustedInsertIndex, 0, ...movingLines);
    nextLineMeta.splice(adjustedInsertIndex, 0, ...movingMeta);
    setFocusIndex(adjustedInsertIndex);
    commit(nextLines.length ? nextLines : [""], nextLineMeta.length ? nextLineMeta : [ownedLineMeta()]);
  }

  function toggleSection(sectionKey: string) {
    setCollapsedSections((current) => ({
      ...current,
      [sectionKey]: !current[sectionKey]
    }));
  }

  async function moveSectionToNewNote(index: number) {
    if (readOnly) return;
    const section = parseSectionLine(lines[index]);
    if (!section) return;

    const sectionEnd = getSectionEnd(lines, index);
    if (normalizedMeta.slice(index, sectionEnd).some((meta) => !canEditLineForUser(currentUser, meta))) return;
    const sectionLines = lines.slice(index, sectionEnd);
    const nextLines = [...lines.slice(0, index), ...lines.slice(sectionEnd)];
    const nextLineMeta = [...normalizedMeta.slice(0, index), ...normalizedMeta.slice(sectionEnd)];
    const nextDescription = nextLines.join("\n");

    setMovingSectionIndex(index);
    const moved = await onMoveSectionToNewNote(section.text, sectionLines, nextDescription, nextLineMeta);
    setMovingSectionIndex(null);

    if (!moved) return;
    setFocusIndex(null);
  }

  async function uploadImageForTask(index: number, file?: File) {
    if (!editableLine(index)) return;
    if (!file) return;

    setUploadingTaskIndex(index);

    const formData = new FormData();
    formData.append("file", file);

    const response = await fetch("/api/uploads/cloudinary", {
      method: "POST",
      body: formData
    });
    const data = (await response.json()) as { image?: InlineImage; error?: string };

    setUploadingTaskIndex(null);

    if (!response.ok || !data.image) {
      alert(data.error ?? "Unable to upload image");
      return;
    }

    const nextLines = [...lines];
    const nextLineMeta = [...normalizedMeta];
    let insertIndex = index + 1;
    while (insertIndex < nextLines.length && parseImageLine(nextLines[insertIndex])) {
      insertIndex += 1;
    }
    nextLines.splice(insertIndex, 0, formatImageLine(data.image));
    nextLineMeta.splice(insertIndex, 0, normalizedMeta[index] ?? ownedLineMeta());
    setFocusIndex(index);
    commit(nextLines, nextLineMeta);
  }

  async function removeImage(index: number) {
    if (!editableLine(index)) return;
    const image = parseImageLine(lines[index]);

    if (image?.publicId) {
      setDeletingImageIndex(index);

      try {
        const response = await fetch("/api/uploads/cloudinary", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ publicId: image.publicId, projectId, noteId })
        });
        const data = (await response.json()) as { error?: string };

        if (!response.ok) {
          alert(data.error ?? "Unable to delete image");
          return;
        }
      } catch {
        alert("Unable to delete image");
        return;
      } finally {
        setDeletingImageIndex(null);
      }
    }

    const nextLines = [...lines];
    const nextLineMeta = [...normalizedMeta];
    nextLines.splice(index, 1);
    nextLineMeta.splice(index, 1);
    setFocusIndex(Math.max(index - 1, 0));
    commit(nextLines.length ? nextLines : [""], nextLineMeta.length ? nextLineMeta : [ownedLineMeta()]);
  }

  function handleDragStart(event: React.DragEvent, index: number) {
    if (readOnly) return;
    const range = getDragRange(index);
    if (normalizedMeta.slice(range.start, range.end).some((meta) => !canEditLineForUser(currentUser, meta))) return;
    setDraggedRange(range);
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", String(index));
  }

  function handleDragOver(event: React.DragEvent<HTMLElement>, index: number) {
    if (readOnly) return;
    if (!draggedRange) return;
    event.preventDefault();
    const bounds = event.currentTarget.getBoundingClientRect();
    const position = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after";
    setDropTarget({ index, position });
  }

  function handleDrop(event: React.DragEvent<HTMLElement>, row: EditorRow) {
    if (readOnly) return;
    event.preventDefault();
    if (!draggedRange || !dropTarget) return;

    const isMovingSection = Boolean(parseSectionLine(lines[draggedRange.start]));
    const isCollapsedSection = Boolean(row.sectionKey && collapsedSections[row.sectionKey]);
    const insertIndex =
      dropTarget.position === "before"
        ? row.index
        : row.section && (isMovingSection || isCollapsedSection)
          ? row.sectionEnd ?? row.index + 1
          : row.index + 1;

    moveRange(draggedRange, insertIndex);
    setDraggedRange(null);
    setDropTarget(null);
  }

  function handleDragEnd() {
    setDraggedRange(null);
    setDropTarget(null);
  }

  function rowDropClass(index: number) {
    if (dropTarget?.index !== index) return "";
    return dropTarget.position === "before" ? "border-t-2 border-brand" : "border-b-2 border-brand";
  }

  type EditorRow = {
    index: number;
    line: string;
    task: ReturnType<typeof parseTaskLine>;
    taskNumber?: number;
    image: ReturnType<typeof parseImageLine>;
    section: ReturnType<typeof parseSectionLine>;
    sectionKey?: string;
    sectionEnd?: number;
  };

  const rows: EditorRow[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const task = parseTaskLine(line);
    const image = parseImageLine(line);
    const section = parseSectionLine(line);
    const taskNumber = task ? lines.slice(0, index + 1).filter((item) => parseTaskLine(item)).length : undefined;
    const sectionKey = section ? getSectionKey(line, index) : undefined;
    const sectionEnd = section ? getSectionEnd(lines, index) : undefined;

    rows.push({ index, line, task, taskNumber, image, section, sectionKey, sectionEnd });

    if (sectionKey && collapsedSections[sectionKey]) {
      index = (sectionEnd ?? index + 1) - 1;
    }
  }

  return (
    <div className="mt-4 flex min-h-0 flex-1 flex-col">
      {!readOnly ? (
        <div className="mb-3 flex flex-wrap gap-2 border-b border-line pb-3">
          <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => insertEditorLine(formatSectionLine(""))} title="Add section">
            <Heading2 size={15} />
            Section
          </button>
          <button type="button" className="btn-secondary px-2.5 py-1.5 text-xs" onClick={() => insertEditorLine(formatTaskLine("", false))} title="Add checklist item">
            <ListPlus size={15} />
            Item
          </button>
        </div>
      ) : null}
      <div className="min-h-0 flex-1 overflow-y-auto pr-2 text-base leading-8 text-slate-700">
        {rows.map((row) => {
          const { index, line, task, taskNumber, image, section } = row;
          const rowMeta = normalizedMeta[index];
          const rowCanEdit = editableLine(index);
          const ownerName = rowMeta?.createdByUserName ?? "Admin";
          const commonKeyHandler = (event: React.KeyboardEvent<HTMLInputElement>) => {
            if (!rowCanEdit) return;
            if (event.key === "Enter") {
              event.preventDefault();
              insertLineAfter(index);
            }
            if (event.key === "Backspace" && line === "") {
              event.preventDefault();
              removeEmptyLine(index);
            }
            if (event.key === "Backspace" && task && task.text === "") {
              event.preventDefault();
              updateLine(index, "");
            }
            if (event.key === "Backspace" && section && section.text === "") {
              event.preventDefault();
              updateLine(index, "");
            }
          };

          if (section) {
            const sectionKey = row.sectionKey ?? getSectionKey(line, index);
            const isCollapsed = Boolean(collapsedSections[sectionKey]);

            return (
              <div
                key={index}
                onDragOver={(event) => handleDragOver(event, index)}
                onDrop={(event) => handleDrop(event, row)}
                  className={cn("flex min-h-9 items-center gap-1 border-b border-line/70 pt-3 first:pt-0", rowDropClass(index))}
              >
                <button
                  type="button"
                  draggable={rowCanEdit}
                  onDragStart={(event) => handleDragStart(event, index)}
                  onDragEnd={handleDragEnd}
                  disabled={!rowCanEdit}
                  className="grid size-7 shrink-0 cursor-grab place-items-center rounded-md text-slate-300 transition hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing disabled:cursor-default disabled:hover:bg-transparent"
                  title="Drag section"
                >
                  <GripVertical size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => toggleSection(sectionKey)}
                  className="grid size-7 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink"
                  title={isCollapsed ? "Expand section" : "Collapse section"}
                >
                  {isCollapsed ? <ChevronRight size={16} /> : <ChevronDown size={16} />}
                </button>
                <input
                  ref={(element) => {
                    inputRefs.current[index] = element;
                  }}
                  className="min-w-0 flex-1 border-none bg-transparent py-1 text-base font-black leading-8 text-ink outline-none placeholder:text-slate-300"
                  value={section.text}
                  onFocus={() => setFocusIndex(index)}
                  onChange={(event) => updateLine(index, formatSectionLine(event.target.value))}
                  onKeyDown={commonKeyHandler}
                  readOnly={!rowCanEdit}
                  placeholder="Section title"
                />
                <span className="shrink-0 text-[11px] font-bold text-slate-400">by {ownerName}</span>
                {rowCanEdit ? (
                  <button
                    type="button"
                    onClick={() => void moveSectionToNewNote(index)}
                    disabled={movingSectionIndex === index}
                    className="grid size-8 shrink-0 place-items-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    title="Move section to new note"
                  >
                    {movingSectionIndex === index ? <Loader2 className="animate-spin" size={15} /> : <FilePlus2 size={15} />}
                  </button>
                ) : null}
              </div>
            );
          }

          if (task) {
            return (
              <div
                key={index}
                onDragOver={(event) => handleDragOver(event, index)}
                onDrop={(event) => handleDrop(event, row)}
                className={cn("group flex min-h-8 items-start gap-2", rowDropClass(index))}
              >
                <button
                  type="button"
                  draggable={rowCanEdit}
                  onDragStart={(event) => handleDragStart(event, index)}
                  onDragEnd={handleDragEnd}
                  disabled={!rowCanEdit}
                  className="mt-1 grid size-6 shrink-0 cursor-grab place-items-center rounded-md text-slate-200 transition hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing disabled:cursor-default disabled:hover:bg-transparent"
                  title="Drag item"
                >
                  <GripVertical size={14} />
                </button>
                <span className="mt-1.5 w-7 shrink-0 text-right text-xs font-bold leading-6 text-slate-400 tabular-nums">
                  {taskNumber}.
                </span>
                <button
                  type="button"
                  onClick={() => updateLine(index, formatTaskLine(task.text, !task.checked, task.indent))}
                  disabled={!rowCanEdit}
                  className={cn(
                    "mt-2 grid size-5 shrink-0 place-items-center rounded border transition disabled:cursor-default",
                    task.checked ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 bg-white text-transparent hover:border-brand"
                  )}
                  title={task.checked ? "Mark incomplete" : "Mark complete"}
                >
                  <Check size={13} strokeWidth={3} />
                </button>
                <input
                  ref={(element) => {
                    inputRefs.current[index] = element;
                  }}
                  className={cn(
                    "min-w-0 flex-1 border-none bg-transparent py-0.5 text-base leading-8 outline-none placeholder:text-slate-300",
                    task.checked && "text-slate-500"
                  )}
                  value={task.text}
                  onFocus={() => setFocusIndex(index)}
                  onChange={(event) => updateLine(index, formatTaskLine(event.target.value, task.checked, task.indent))}
                  onPaste={(event) => {
                    const image = getClipboardImageFile(event);
                    if (!image) return;
                    event.preventDefault();
                    void uploadImageForTask(index, image);
                  }}
                  onKeyDown={commonKeyHandler}
                  readOnly={!rowCanEdit}
                  placeholder="Checklist item"
                />
                <span className="mt-1.5 shrink-0 text-[11px] font-bold leading-6 text-slate-400">by {ownerName}</span>
                {rowCanEdit ? (
                  <label
                    className="mt-1 grid size-7 shrink-0 cursor-pointer place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-ink"
                    title="Add or paste image"
                  >
                    {uploadingTaskIndex === index ? <Loader2 className="animate-spin" size={15} /> : <ImageIcon size={15} />}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploadingTaskIndex === index}
                      onChange={(event) => {
                        void uploadImageForTask(index, event.target.files?.[0]);
                        event.target.value = "";
                      }}
                    />
                  </label>
                ) : null}
              </div>
            );
          }

          if (image) {
            return (
              <div
                key={index}
                onDragOver={(event) => handleDragOver(event, index)}
                onDrop={(event) => handleDrop(event, row)}
                className={cn("ml-24 flex items-start gap-3 py-2", rowDropClass(index))}
              >
                <a href={image.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-md border border-line bg-cloud shadow-sm transition hover:shadow-soft">
                  <img src={image.url} alt="Checklist item upload" className="h-28 w-44 object-cover" />
                </a>
                <span className="mt-1 shrink-0 text-[11px] font-bold text-slate-400">by {ownerName}</span>
                {rowCanEdit ? (
                  <button
                    type="button"
                    onClick={() => void removeImage(index)}
                    disabled={deletingImageIndex === index}
                    className="mt-1 grid size-7 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                    title="Remove image"
                  >
                    {deletingImageIndex === index ? <Loader2 className="animate-spin" size={15} /> : <X size={15} />}
                  </button>
                ) : null}
              </div>
            );
          }

          return (
            <div
              key={index}
              onDragOver={(event) => handleDragOver(event, index)}
              onDrop={(event) => handleDrop(event, row)}
              className={cn("flex min-h-8 items-start gap-2", rowDropClass(index))}
            >
              <button
                type="button"
                draggable={rowCanEdit}
                onDragStart={(event) => handleDragStart(event, index)}
                onDragEnd={handleDragEnd}
                disabled={!rowCanEdit}
                className="mt-1 grid size-6 shrink-0 cursor-grab place-items-center rounded-md text-slate-200 transition hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing disabled:cursor-default disabled:hover:bg-transparent"
                title="Drag line"
              >
                <GripVertical size={14} />
              </button>
              <input
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                className="min-w-0 flex-1 border-none bg-transparent py-0.5 text-base leading-8 outline-none placeholder:text-slate-300"
                value={line}
                onFocus={() => setFocusIndex(index)}
                onChange={(event) => updateLine(index, event.target.value)}
                onKeyDown={commonKeyHandler}
                readOnly={!rowCanEdit}
                placeholder={index === 0 ? "Start writing..." : ""}
              />
              <span className="mt-1.5 shrink-0 text-[11px] font-bold leading-6 text-slate-400">by {ownerName}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
