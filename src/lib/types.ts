export const projectTypes = ["Website", "Mobile App", "Backend", "UI/UX", "Full Stack", "Other"] as const;
export const projectStatuses = ["Pending", "In Progress", "On Hold", "Completed", "Cancelled"] as const;
export const priorities = ["Low", "Medium", "High", "Urgent"] as const;
export const noteTypes = ["General", "Client Call", "Requirement", "Bug", "Payment", "Meeting", "Delivery", "Important"] as const;

export type ProjectType = (typeof projectTypes)[number];
export type ProjectStatus = (typeof projectStatuses)[number];
export type Priority = (typeof priorities)[number];
export type NoteType = (typeof noteTypes)[number];
export type UserRole = "admin" | "user";

export type Asset = {
  url: string;
  publicId?: string;
  width?: number;
  height?: number;
};

export type ProjectLinks = {
  github?: string;
  figma?: string;
  live?: string;
  admin?: string;
  other?: string;
};

export type Note = {
  _id: string;
  title: string;
  description: string;
  type: NoteType;
  createdByUserId?: string;
  createdByUserName?: string;
  createdByUserRole?: UserRole;
  sharedWith?: string[];
  lineMeta?: NoteLineMeta[];
  manualDateTime?: string;
  followUpDateTime?: string;
  images: Asset[];
  tags: string[];
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
};

export type NoteLineMeta = {
  id: string;
  createdByUserId?: string;
  createdByUserName: string;
  createdByUserRole: UserRole;
  createdAt: string;
};

export type Project = {
  _id: string;
  title: string;
  clientName: string;
  clientPhone: string;
  clientEmail: string;
  companyName?: string;
  type: ProjectType;
  description: string;
  budget: number;
  advanceReceived: number;
  remainingPayment: number;
  status: ProjectStatus;
  priority: Priority;
  startDate?: string;
  deadlineDate?: string;
  techStack: string[];
  links: ProjectLinks;
  coverImage?: Asset;
  ownerUserId?: string;
  ownerUserName?: string;
  ownerUserRole?: UserRole;
  sharedWith?: string[];
  notes: Note[];
  createdAt: string;
  updatedAt: string;
};

export type ProjectInput = Omit<Project, "_id" | "notes" | "createdAt" | "updatedAt">;
export type NoteInput = Omit<Note, "_id" | "createdAt" | "updatedAt">;
export type AuthUser = {
  _id: string;
  username: string;
  displayName: string;
  role: UserRole;
};

export type User = AuthUser & {
  createdAt: string;
  updatedAt: string;
};
