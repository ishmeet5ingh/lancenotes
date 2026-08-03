import nodeCrypto from "crypto";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { connectDb, isMongoConfigured } from "./db";
import { firebaseAppPaths, firebaseRequest } from "./firebase-rtdb";
import { ProjectModel, UserModel } from "./models";
import type { AuthUser, Note, NoteInput, NoteLineMeta, Project, ProjectInput, User, UserRole } from "./types";
import type mongoose from "mongoose";

const localStorePath = path.join(process.cwd(), ".data", "notes.json");
const localUsersPath = path.join(process.cwd(), ".data", "users.json");
const defaultAdminUsername = process.env.ADMIN_USERNAME?.trim().toLowerCase() || "admin";
const defaultAdminPassword = process.env.ADMIN_PASSWORD || "admin123";

type StoredUser = User & {
  passwordHash: string;
};

function nowIso() {
  return new Date().toISOString();
}

export function lineMetaForUser(user: AuthUser): NoteLineMeta {
  return {
    id: nodeCrypto.randomUUID(),
    createdByUserId: user._id,
    createdByUserName: user.displayName || user.username,
    createdByUserRole: user.role,
    createdAt: nowIso()
  };
}

export function adminLineMeta(id: string = nodeCrypto.randomUUID()): NoteLineMeta {
  return {
    id,
    createdByUserName: "Admin",
    createdByUserRole: "admin",
    createdAt: id.startsWith("legacy-") ? "legacy" : nowIso()
  };
}

export function normalizedLineMetaForDescription(description: string, lineMeta?: NoteLineMeta[]) {
  const lineCount = description.length ? description.split("\n").length : 1;
  return Array.from({ length: lineCount }, (_, index) => {
    const current = lineMeta?.[index];
    if (current?.id) return current;
    return {
      ...(current ?? adminLineMeta(`legacy-${index}`)),
      id: current?.id ?? `legacy-${index}`
    };
  });
}

function normalize<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function firebaseArray<T>(value: T[] | Record<string, T> | null | undefined): T[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return Object.values(value).filter(Boolean);
}

function normalizeFirebaseNote(note: Note): Note {
  return {
    ...note,
    sharedWith: firebaseArray(note.sharedWith as string[] | Record<string, string> | null | undefined),
    lineMeta: firebaseArray(note.lineMeta as NoteLineMeta[] | Record<string, NoteLineMeta> | null | undefined),
    images: firebaseArray(note.images as Note["images"] | Record<string, Note["images"][number]> | null | undefined),
    tags: firebaseArray(note.tags as string[] | Record<string, string> | null | undefined),
    pinned: Boolean(note.pinned)
  };
}

function normalizeFirebaseProject(project: Project): Project {
  return {
    ...project,
    techStack: firebaseArray(project.techStack as string[] | Record<string, string> | null | undefined),
    links: project.links ?? {},
    sharedWith: firebaseArray(project.sharedWith as string[] | Record<string, string> | null | undefined),
    notes: firebaseArray(project.notes as Note[] | Record<string, Note> | null | undefined).map(normalizeFirebaseNote)
  };
}

function withComputedPayment(input: ProjectInput): ProjectInput {
  return {
    ...input,
    budget: Number(input.budget || 0),
    advanceReceived: Number(input.advanceReceived || 0),
    remainingPayment: Math.max(Number(input.budget || 0) - Number(input.advanceReceived || 0), 0)
  };
}

function withoutSubmittedOwnership(input: ProjectInput): ProjectInput {
  const safeInput = { ...input };
  delete safeInput.ownerUserId;
  delete safeInput.ownerUserName;
  delete safeInput.ownerUserRole;
  return safeInput;
}

async function readLocalProjects(): Promise<Project[]> {
  try {
    const data = await readFile(localStorePath, "utf8");
    return JSON.parse(data) as Project[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function readLocalUsers(): Promise<StoredUser[]> {
  try {
    const data = await readFile(localUsersPath, "utf8");
    return JSON.parse(data) as StoredUser[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

async function writeLocalProjects(projects: Project[]) {
  await mkdir(path.dirname(localStorePath), { recursive: true });
  await writeFile(localStorePath, JSON.stringify(projects, null, 2));
}

async function writeLocalUsers(users: StoredUser[]) {
  await mkdir(path.dirname(localUsersPath), { recursive: true });
  await writeFile(localUsersPath, JSON.stringify(users, null, 2));
}

function isFirebaseStorageEnabled() {
  return process.env.DATA_BACKEND === "firebase" || process.env.USE_FIREBASE_STORAGE === "true";
}

async function readFirebaseProjects(): Promise<Project[]> {
  if (!isFirebaseStorageEnabled()) return [];
  const projects = await firebaseRequest<Project[] | Record<string, Project> | null>(firebaseAppPaths.projects);
  return firebaseArray(projects).map(normalizeFirebaseProject);
}

async function writeFirebaseProjects(projects: Project[]) {
  await firebaseRequest(firebaseAppPaths.projects, {
    method: "PUT",
    body: JSON.stringify(projects)
  });
}

async function readFirebaseUsers(): Promise<StoredUser[]> {
  if (!isFirebaseStorageEnabled()) return [];
  const users = await firebaseRequest<StoredUser[] | Record<string, StoredUser> | null>(firebaseAppPaths.users);
  return firebaseArray(users);
}

async function writeFirebaseUsers(users: StoredUser[]) {
  await firebaseRequest(firebaseAppPaths.users, {
    method: "PUT",
    body: JSON.stringify(users)
  });
}

async function patchFirebaseProject(projectIndex: number, input: Partial<Project>) {
  await firebaseRequest(`${firebaseAppPaths.projects}/${projectIndex}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

async function patchFirebaseNote(projectIndex: number, noteIndex: number, input: Partial<Note>) {
  await firebaseRequest(`${firebaseAppPaths.projects}/${projectIndex}/notes/${noteIndex}`, {
    method: "PATCH",
    body: JSON.stringify(input)
  });
}

function ensureProjectTitle(input: Pick<ProjectInput, "title">) {
  if (!input.title?.trim()) {
    throw new Error("Project title is required");
  }
}

function ensureUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,40}$/.test(normalized)) {
    throw new Error("User ID must be 3-40 characters using letters, numbers, dots, dashes, or underscores");
  }
  return normalized;
}

function ensurePassword(password: string) {
  if (password.length < 6) {
    throw new Error("Password must be at least 6 characters");
  }
}

function hashPassword(password: string) {
  const salt = nodeCrypto.randomBytes(16).toString("hex");
  const hash = nodeCrypto.pbkdf2Sync(password, salt, 120000, 32, "sha256").toString("hex");
  return `pbkdf2_sha256$120000$${salt}$${hash}`;
}

function verifyPassword(password: string, storedHash: string) {
  const [algorithm, iterations, salt, hash] = storedHash.split("$");
  if (algorithm !== "pbkdf2_sha256" || !iterations || !salt || !hash) return false;
  const candidate = nodeCrypto.pbkdf2Sync(password, salt, Number(iterations), 32, "sha256");
  const expected = Buffer.from(hash, "hex");
  return expected.length === candidate.length && nodeCrypto.timingSafeEqual(candidate, expected);
}

function sanitizeUser(user: StoredUser): User {
  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt
  };
}

function toAuthUser(user: User): AuthUser {
  return {
    _id: user._id,
    username: user.username,
    displayName: user.displayName,
    role: user.role
  };
}

async function runMongo<T>(fn: () => Promise<T>) {
  if (!isMongoConfigured()) return null;
  await connectDb();
  return fn();
}

async function ensureDefaultAdmin() {
  if (isFirebaseStorageEnabled()) {
    const users = await readFirebaseUsers();
    if (users.length > 0) return;

    const now = nowIso();
    users.push({
      _id: nodeCrypto.randomUUID(),
      username: defaultAdminUsername,
      displayName: "Admin",
      passwordHash: hashPassword(defaultAdminPassword),
      role: "admin",
      createdAt: now,
      updatedAt: now
    });
    await writeFirebaseUsers(users);
    return;
  }

  const mongo = await runMongo(async () => {
    const userCount = await UserModel.countDocuments();
    if (userCount > 0) return true;

    await UserModel.create({
      username: defaultAdminUsername,
      displayName: "Admin",
      passwordHash: hashPassword(defaultAdminPassword),
      role: "admin"
    });
    return true;
  });
  if (mongo) return;

  const users = await readLocalUsers();
  if (users.length > 0) return;

  const now = nowIso();
  users.push({
    _id: nodeCrypto.randomUUID(),
    username: defaultAdminUsername,
    displayName: "Admin",
    passwordHash: hashPassword(defaultAdminPassword),
    role: "admin",
    createdAt: now,
    updatedAt: now
  });
  await writeLocalUsers(users);
}

export async function listUsers(): Promise<User[]> {
  await ensureDefaultAdmin();
  if (isFirebaseStorageEnabled()) {
    const users = await readFirebaseUsers();
    return users.map(sanitizeUser).sort((a, b) => a.displayName.localeCompare(b.displayName));
  }

  const mongo = await runMongo(async () => UserModel.find().sort({ role: 1, displayName: 1 }).lean());
  if (mongo) return (normalize(mongo) as unknown as StoredUser[]).map(sanitizeUser);

  const users = await readLocalUsers();
  return users.map(sanitizeUser).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function getUserById(id: string): Promise<AuthUser | null> {
  await ensureDefaultAdmin();
  if (isFirebaseStorageEnabled()) {
    const users = await readFirebaseUsers();
    const user = users.find((item) => item._id === id);
    return user ? toAuthUser(sanitizeUser(user)) : null;
  }

  const mongo = await runMongo(async () => UserModel.findById(id).lean());
  if (mongo) return toAuthUser(sanitizeUser(normalize(mongo) as unknown as StoredUser));

  const users = await readLocalUsers();
  const user = users.find((item) => item._id === id);
  return user ? toAuthUser(sanitizeUser(user)) : null;
}

export async function verifyUserCredentials(username: string, password: string): Promise<AuthUser | null> {
  await ensureDefaultAdmin();
  const normalizedUsername = username.trim().toLowerCase();

  if (isFirebaseStorageEnabled()) {
    const users = await readFirebaseUsers();
    const user = users.find((item) => item.username === normalizedUsername);
    return user && verifyPassword(password, user.passwordHash) ? toAuthUser(sanitizeUser(user)) : null;
  }

  const mongo = await runMongo(async () => UserModel.findOne({ username: normalizedUsername }).lean());
  if (mongo) {
    const user = normalize(mongo) as unknown as StoredUser;
    return verifyPassword(password, user.passwordHash) ? toAuthUser(sanitizeUser(user)) : null;
  }

  const users = await readLocalUsers();
  const user = users.find((item) => item.username === normalizedUsername);
  return user && verifyPassword(password, user.passwordHash) ? toAuthUser(sanitizeUser(user)) : null;
}

export async function createUser(input: { username: string; password: string; displayName?: string; role?: UserRole }): Promise<User> {
  await ensureDefaultAdmin();
  const username = ensureUsername(input.username);
  ensurePassword(input.password);

  const displayName = input.displayName?.trim() || username;
  const role = input.role === "admin" ? "admin" : "user";
  const passwordHash = hashPassword(input.password);

  if (isFirebaseStorageEnabled()) {
    const users = await readFirebaseUsers();
    if (users.some((user) => user.username === username)) {
      throw new Error("User ID is already in use");
    }

    const now = nowIso();
    const user: StoredUser = {
      _id: nodeCrypto.randomUUID(),
      username,
      displayName,
      passwordHash,
      role,
      createdAt: now,
      updatedAt: now
    };
    users.push(user);
    await writeFirebaseUsers(users);
    return sanitizeUser(user);
  }

  const mongo = await runMongo(async () => {
    const exists = await UserModel.findOne({ username }).lean();
    if (exists) throw new Error("User ID is already in use");
    const user = await UserModel.create({ username, displayName, passwordHash, role });
    return user.toObject();
  });
  if (mongo) return sanitizeUser(normalize(mongo) as unknown as StoredUser);

  const users = await readLocalUsers();
  if (users.some((user) => user.username === username)) {
    throw new Error("User ID is already in use");
  }

  const now = nowIso();
  const user: StoredUser = {
    _id: nodeCrypto.randomUUID(),
    username,
    displayName,
    passwordHash,
    role,
    createdAt: now,
    updatedAt: now
  };
  users.push(user);
  await writeLocalUsers(users);
  return sanitizeUser(user);
}

export async function changeOwnPassword(userId: string, currentPassword: string, nextPassword: string): Promise<boolean> {
  await ensureDefaultAdmin();
  ensurePassword(nextPassword);

  if (isFirebaseStorageEnabled()) {
    const users = await readFirebaseUsers();
    const user = users.find((item) => item._id === userId);
    if (!user) return false;
    if (!verifyPassword(currentPassword, user.passwordHash)) {
      throw new Error("Current password is incorrect");
    }

    user.passwordHash = hashPassword(nextPassword);
    user.updatedAt = nowIso();
    await writeFirebaseUsers(users);
    return true;
  }

  const mongo = await runMongo(async () => {
    const user = await UserModel.findById(userId);
    if (!user) return null;
    const passwordHash = user.get("passwordHash") as string;
    if (!verifyPassword(currentPassword, passwordHash)) {
      throw new Error("Current password is incorrect");
    }
    user.set("passwordHash", hashPassword(nextPassword));
    await user.save();
    return true;
  });
  if (mongo !== null) return Boolean(mongo);

  const users = await readLocalUsers();
  const user = users.find((item) => item._id === userId);
  if (!user) return false;
  if (!verifyPassword(currentPassword, user.passwordHash)) {
    throw new Error("Current password is incorrect");
  }

  user.passwordHash = hashPassword(nextPassword);
  user.updatedAt = nowIso();
  await writeLocalUsers(users);
  return true;
}

export async function resetUserPassword(userId: string, nextPassword: string): Promise<User | null> {
  await ensureDefaultAdmin();
  ensurePassword(nextPassword);

  if (isFirebaseStorageEnabled()) {
    const users = await readFirebaseUsers();
    const user = users.find((item) => item._id === userId);
    if (!user) return null;
    user.passwordHash = hashPassword(nextPassword);
    user.updatedAt = nowIso();
    await writeFirebaseUsers(users);
    return sanitizeUser(user);
  }

  const mongo = await runMongo(async () => {
    const user = await UserModel.findById(userId);
    if (!user) return null;
    user.set("passwordHash", hashPassword(nextPassword));
    await user.save();
    return user.toObject();
  });
  if (mongo) return sanitizeUser(normalize(mongo) as unknown as StoredUser);

  const users = await readLocalUsers();
  const user = users.find((item) => item._id === userId);
  if (!user) return null;
  user.passwordHash = hashPassword(nextPassword);
  user.updatedAt = nowIso();
  await writeLocalUsers(users);
  return sanitizeUser(user);
}

export async function listProjects(): Promise<Project[]> {
  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    return projects.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
  }

  const mongo = await runMongo(async () => ProjectModel.find().sort({ updatedAt: -1 }).lean());
  if (mongo) return normalize(mongo) as unknown as Project[];
  const projects = await readLocalProjects();
  return projects.sort((a, b) => +new Date(b.updatedAt) - +new Date(a.updatedAt));
}

export async function getProject(id: string): Promise<Project | null> {
  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    return projects.find((project) => project._id === id) ?? null;
  }

  const mongo = await runMongo(async () => ProjectModel.findById(id).lean());
  if (mongo) return normalize(mongo) as unknown as Project;
  const projects = await readLocalProjects();
  return projects.find((project) => project._id === id) ?? null;
}

export async function createProject(input: ProjectInput, owner?: AuthUser): Promise<Project> {
  ensureProjectTitle(input);
  const payload = withComputedPayment(withoutSubmittedOwnership(input));
  const ownership = owner?.role === "user"
    ? {
        ownerUserId: owner._id,
        ownerUserName: owner.displayName || owner.username,
        ownerUserRole: owner.role
      }
    : {};

  if (isFirebaseStorageEnabled()) {
    const created: Project = {
      ...payload,
      ...ownership,
      _id: nodeCrypto.randomUUID(),
      sharedWith: payload.sharedWith ?? [],
      notes: [],
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    const projects = await readFirebaseProjects();
    projects.unshift(created);
    await writeFirebaseProjects(projects);
    return created;
  }

  const mongo = await runMongo(async () => ProjectModel.create({ ...payload, ...ownership }));
  if (mongo) return normalize(mongo.toObject()) as unknown as Project;

  const created: Project = {
    ...payload,
    ...ownership,
    _id: nodeCrypto.randomUUID(),
    sharedWith: payload.sharedWith ?? [],
    notes: [],
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  const projects = await readLocalProjects();
  projects.unshift(created);
  await writeLocalProjects(projects);
  return created;
}

export async function updateProject(id: string, input: Partial<ProjectInput>): Promise<Project | null> {
  if (input.title !== undefined) ensureProjectTitle(input as Pick<ProjectInput, "title">);
  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    const index = projects.findIndex((project) => project._id === id);
    if (index === -1) return null;
    const merged = {
      ...projects[index],
      ...input,
      updatedAt: nowIso()
    };
    projects[index] = merged;
    await writeFirebaseProjects(projects);
    return merged;
  }

  const mongo = await runMongo(async () =>
    ProjectModel.findByIdAndUpdate(id, input, { new: true, runValidators: true }).lean()
  );
  if (mongo) return normalize(mongo) as unknown as Project;

  const projects = await readLocalProjects();
  const index = projects.findIndex((project) => project._id === id);
  if (index === -1) return null;
  const merged = {
    ...projects[index],
    ...input,
    updatedAt: nowIso()
  };
  projects[index] = merged;
  await writeLocalProjects(projects);
  return merged;
}

export async function deleteProject(id: string): Promise<boolean> {
  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    const index = projects.findIndex((project) => project._id === id);
    if (index === -1) return false;
    projects.splice(index, 1);
    await writeFirebaseProjects(projects);
    return true;
  }

  const mongo = await runMongo(async () => ProjectModel.findByIdAndDelete(id).lean());
  if (mongo !== null) return Boolean(mongo);

  const projects = await readLocalProjects();
  const index = projects.findIndex((project) => project._id === id);
  if (index === -1) return false;
  projects.splice(index, 1);
  await writeLocalProjects(projects);
  return true;
}

function buildMovedNote(project: Project): NoteInput {
  const notes = [...project.notes].sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  const firstNote = notes[0];
  const description =
    notes.length <= 1
      ? firstNote?.description || project.description || ""
      : notes
          .map((note) => {
            const title = note.title.trim();
            return [title ? `## ${title}` : "", note.description.trim()].filter(Boolean).join("\n");
          })
          .filter(Boolean)
          .join("\n\n");

  return {
    title: project.title.trim() || firstNote?.title || "Untitled note",
    description,
    type: firstNote?.type ?? "General",
    createdByUserId: firstNote?.createdByUserId,
    createdByUserName: firstNote?.createdByUserName,
    createdByUserRole: firstNote?.createdByUserRole,
    sharedWith: firstNote?.sharedWith ?? [],
    lineMeta: normalizedLineMetaForDescription(description, notes.flatMap((note) => note.lineMeta ?? [])),
    manualDateTime: firstNote?.manualDateTime,
    followUpDateTime: firstNote?.followUpDateTime,
    images: notes.flatMap((note) => note.images ?? []),
    tags: [...new Set(notes.flatMap((note) => note.tags ?? []))],
    pinned: firstNote?.pinned ?? false
  };
}

export async function moveProjectIntoProject(sourceId: string, targetId: string): Promise<Project | null> {
  if (sourceId === targetId) {
    throw new Error("Choose a different title to move into");
  }

  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    const sourceIndex = projects.findIndex((project) => project._id === sourceId);
    const target = projects.find((project) => project._id === targetId);
    if (sourceIndex === -1 || !target) return null;

    const source = projects[sourceIndex];
    const movedNote: Note = {
      ...buildMovedNote(source),
      _id: nodeCrypto.randomUUID(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };

    target.notes.unshift(movedNote);
    target.updatedAt = nowIso();
    projects.splice(sourceIndex, 1);
    await writeFirebaseProjects(projects);
    return target;
  }

  const mongo = await runMongo(async () => {
    const source = await ProjectModel.findById(sourceId).lean();
    const target = await ProjectModel.findById(targetId);
    if (!source || !target) return null;

    const sourceProject = normalize(source) as unknown as Project;
    const movedNote = buildMovedNote(sourceProject);
    (target.get("notes") as unknown[]).push(movedNote);
    await target.save();
    await ProjectModel.findByIdAndDelete(sourceId);
    return target.toObject();
  });
  if (mongo) return normalize(mongo) as unknown as Project;

  const projects = await readLocalProjects();
  const sourceIndex = projects.findIndex((project) => project._id === sourceId);
  const target = projects.find((project) => project._id === targetId);
  if (sourceIndex === -1 || !target) return null;

  const source = projects[sourceIndex];
  const movedNote: Note = {
    ...buildMovedNote(source),
    _id: nodeCrypto.randomUUID(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  target.notes.unshift(movedNote);
  target.updatedAt = nowIso();
  projects.splice(sourceIndex, 1);
  await writeLocalProjects(projects);
  return target;
}

export async function updateProjectAccess(projectId: string, userId: string, hasAccess: boolean): Promise<Project | null> {
  const user = await getUserById(userId);
  if (!user || user.role !== "user") {
    throw new Error("Shared access can only be assigned to a regular user");
  }

  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    const project = projects.find((item) => item._id === projectId);
    if (!project) return null;

    const currentAccess = project.sharedWith ?? [];
    project.sharedWith = hasAccess ? [...new Set([...currentAccess, userId])] : currentAccess.filter((id) => id !== userId);
    project.updatedAt = nowIso();
    await writeFirebaseProjects(projects);
    return project;
  }

  const mongo = await runMongo(async () => {
    const update = hasAccess ? { $addToSet: { sharedWith: userId } } : { $pull: { sharedWith: userId } };
    return ProjectModel.findByIdAndUpdate(projectId, update, { new: true }).lean();
  });
  if (mongo) return normalize(mongo) as unknown as Project;

  const projects = await readLocalProjects();
  const project = projects.find((item) => item._id === projectId);
  if (!project) return null;

  const currentAccess = project.sharedWith ?? [];
  project.sharedWith = hasAccess ? [...new Set([...currentAccess, userId])] : currentAccess.filter((id) => id !== userId);
  project.updatedAt = nowIso();
  await writeLocalProjects(projects);
  return project;
}

export async function updateNoteAccess(projectId: string, noteId: string, userId: string, hasAccess: boolean): Promise<Project | null> {
  const user = await getUserById(userId);
  if (!user || user.role !== "user") {
    throw new Error("Note access can only be assigned to a regular user");
  }

  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    const project = projects.find((item) => item._id === projectId);
    const note = project?.notes.find((item) => item._id === noteId);
    if (!project || !note) return null;

    const currentAccess = note.sharedWith ?? [];
    note.sharedWith = hasAccess ? [...new Set([...currentAccess, userId])] : currentAccess.filter((id) => id !== userId);
    project.updatedAt = nowIso();
    await writeFirebaseProjects(projects);
    return project;
  }

  const mongo = await runMongo(async () => {
    const project = await ProjectModel.findById(projectId);
    if (!project) return null;
    const notes = project.get("notes") as mongoose.Types.DocumentArray<mongoose.Types.Subdocument>;
    const note = notes.id(noteId);
    if (!note) return null;
    const currentSharedWith = ((note.get("sharedWith") as string[] | undefined) ?? []) as string[];
    note.set(
      "sharedWith",
      hasAccess ? [...new Set([...currentSharedWith, userId])] : currentSharedWith.filter((id) => id !== userId)
    );
    await project.save();
    return project.toObject();
  });
  if (mongo) return normalize(mongo) as unknown as Project;

  const projects = await readLocalProjects();
  const project = projects.find((item) => item._id === projectId);
  const note = project?.notes.find((item) => item._id === noteId);
  if (!project || !note) return null;

  const currentAccess = note.sharedWith ?? [];
  note.sharedWith = hasAccess ? [...new Set([...currentAccess, userId])] : currentAccess.filter((id) => id !== userId);
  project.updatedAt = nowIso();
  await writeLocalProjects(projects);
  return project;
}

export async function addNote(projectId: string, input: NoteInput): Promise<Project | null> {
  const noteInput = {
    ...input,
    sharedWith: input.sharedWith ?? [],
    lineMeta: normalizedLineMetaForDescription(input.description ?? "", input.lineMeta)
  };
  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    const project = projects.find((item) => item._id === projectId);
    if (!project) return null;
    const note: Note = {
      ...noteInput,
      _id: nodeCrypto.randomUUID(),
      createdAt: nowIso(),
      updatedAt: nowIso()
    };
    project.notes.unshift(note);
    project.updatedAt = nowIso();
    await writeFirebaseProjects(projects);
    return project;
  }

  const mongo = await runMongo(async () => {
    const project = await ProjectModel.findById(projectId);
    if (!project) return null;
    (project.get("notes") as unknown[]).push(noteInput);
    await project.save();
    return project.toObject();
  });
  if (mongo) return normalize(mongo) as unknown as Project;

  const projects = await readLocalProjects();
  const project = projects.find((item) => item._id === projectId);
  if (!project) return null;
  const note: Note = {
    ...noteInput,
    _id: nodeCrypto.randomUUID(),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  project.notes.unshift(note);
  project.updatedAt = nowIso();
  await writeLocalProjects(projects);
  return project;
}

export async function updateNote(projectId: string, noteId: string, input: Partial<NoteInput>): Promise<Project | null> {
  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    const projectIndex = projects.findIndex((item) => item._id === projectId);
    const project = projects[projectIndex];
    const noteIndex = project?.notes.findIndex((item) => item._id === noteId) ?? -1;
    const note = noteIndex >= 0 ? project?.notes[noteIndex] : undefined;
    if (!project || !note) return null;
    const updatedAt = nowIso();
    Object.assign(note, input, { updatedAt });
    project.updatedAt = updatedAt;
    await Promise.all([
      patchFirebaseNote(projectIndex, noteIndex, { ...input, updatedAt }),
      patchFirebaseProject(projectIndex, { updatedAt })
    ]);
    return project;
  }

  const mongo = await runMongo(async () => {
    const project = await ProjectModel.findById(projectId);
    if (!project) return null;
    const notes = project.get("notes") as mongoose.Types.DocumentArray<mongoose.Types.Subdocument>;
    const note = notes.id(noteId);
    if (!note) return null;
    note.set(input);
    await project.save();
    return project.toObject();
  });
  if (mongo) return normalize(mongo) as unknown as Project;

  const projects = await readLocalProjects();
  const project = projects.find((item) => item._id === projectId);
  const note = project?.notes.find((item) => item._id === noteId);
  if (!project || !note) return null;
  Object.assign(note, input, { updatedAt: nowIso() });
  project.updatedAt = nowIso();
  await writeLocalProjects(projects);
  return project;
}

export async function deleteNote(projectId: string, noteId: string): Promise<Project | null> {
  if (isFirebaseStorageEnabled()) {
    const projects = await readFirebaseProjects();
    const project = projects.find((item) => item._id === projectId);
    if (!project) return null;
    project.notes = project.notes.filter((note) => note._id !== noteId);
    project.updatedAt = nowIso();
    await writeFirebaseProjects(projects);
    return project;
  }

  const mongo = await runMongo(async () => {
    const project = await ProjectModel.findById(projectId);
    if (!project) return null;
    const notes = project.get("notes") as mongoose.Types.DocumentArray<mongoose.Types.Subdocument>;
    const note = notes.id(noteId);
    if (!note) return null;
    note.deleteOne();
    await project.save();
    return project.toObject();
  });
  if (mongo) return normalize(mongo) as unknown as Project;

  const projects = await readLocalProjects();
  const project = projects.find((item) => item._id === projectId);
  if (!project) return null;
  project.notes = project.notes.filter((note) => note._id !== noteId);
  project.updatedAt = nowIso();
  await writeLocalProjects(projects);
  return project;
}

export async function migrateLocalDataToFirebaseApp() {
  const [projects, users] = await Promise.all([readLocalProjects(), readLocalUsers()]);
  const totalNotes = projects.reduce((count, project) => count + project.notes.length, 0);
  const totalLines = projects.reduce(
    (count, project) =>
      count +
      project.notes.reduce((noteCount, note) => noteCount + (note.description.length ? note.description.split("\n").length : 1), 0),
    0
  );
  const metadata = {
    source: "lancenotes-local-to-firebase",
    migratedAt: nowIso()
  };

  await firebaseRequest(firebaseAppPaths.root, {
    method: "PUT",
    body: JSON.stringify({
      metadata,
      projects,
      users
    })
  });

  const [firebaseProjects, firebaseUsers] = await Promise.all([
    firebaseRequest<Project[] | Record<string, Project> | null>(firebaseAppPaths.projects),
    firebaseRequest<StoredUser[] | Record<string, StoredUser> | null>(firebaseAppPaths.users)
  ]);
  const migratedProjects = firebaseArray(firebaseProjects).map(normalizeFirebaseProject);
  const migratedUsers = firebaseArray(firebaseUsers);
  const migratedNotes = migratedProjects.reduce((count, project) => count + project.notes.length, 0);
  const migratedLines = migratedProjects.reduce(
    (count, project) =>
      count +
      project.notes.reduce((noteCount, note) => noteCount + (note.description.length ? note.description.split("\n").length : 1), 0),
    0
  );

  return {
    path: `/${firebaseAppPaths.root}`,
    counts: {
      projects: projects.length,
      notes: totalNotes,
      lines: totalLines,
      users: users.length
    },
    checks: {
      projectsMatch: migratedProjects.length === projects.length,
      notesMatch: migratedNotes === totalNotes,
      linesMatch: migratedLines === totalLines,
      usersMatch: migratedUsers.length === users.length
    }
  };
}
