import type { AuthUser, Note, NoteLineMeta, Project } from "./types";

export function isAdmin(user: AuthUser | null | undefined) {
  return user?.role === "admin";
}

export function isProjectOwner(user: AuthUser, project: Project) {
  return Boolean(project.ownerUserId && project.ownerUserId === user._id);
}

export function isUserOwnedProject(project: Project) {
  return Boolean(project.ownerUserId && project.ownerUserRole === "user");
}

export function canViewProject(user: AuthUser, project: Project) {
  return isAdmin(user) || isProjectOwner(user, project) || (project.sharedWith ?? []).includes(user._id) || project.notes.some((note) => canViewNote(user, note, project));
}

export function canManageProject(user: AuthUser) {
  return isAdmin(user);
}

export function canAddNote(user: AuthUser, project: Project) {
  return isAdmin(user) || isProjectOwner(user, project) || (project.sharedWith ?? []).includes(user._id);
}

export function canEditNote(user: AuthUser, note: Note) {
  if (isAdmin(user)) return note.createdByUserRole !== "user";
  return note.createdByUserId === user._id;
}

export function canViewNote(user: AuthUser, note: Note, project?: Project) {
  return (
    isAdmin(user) ||
    Boolean(project && isProjectOwner(user, project)) ||
    note.createdByUserId === user._id ||
    (note.sharedWith ?? []).includes(user._id) ||
    ((project?.sharedWith ?? []).includes(user._id) && note.createdByUserRole !== "user")
  );
}

export function canContributeToNote(user: AuthUser, note: Note, project?: Project) {
  return canViewNote(user, note, project);
}

export function canEditLine(user: AuthUser, lineMeta?: NoteLineMeta) {
  if (!lineMeta || lineMeta.createdByUserRole !== "user") return isAdmin(user);
  return lineMeta.createdByUserId === user._id;
}

export function projectForUser(user: AuthUser, project: Project): Project {
  if (isAdmin(user) || isProjectOwner(user, project)) return project;

  return {
    ...project,
    notes: project.notes.filter((note) => canViewNote(user, note, project))
  };
}
