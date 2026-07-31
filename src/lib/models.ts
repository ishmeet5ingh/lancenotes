import mongoose, { Schema, model, models } from "mongoose";
import { noteTypes, priorities, projectStatuses, projectTypes } from "./types";

const AssetSchema = new Schema(
  {
    url: { type: String, required: true },
    publicId: String,
    width: Number,
    height: Number
  },
  { _id: false }
);

const NoteLineMetaSchema = new Schema(
  {
    id: { type: String, required: true },
    createdByUserId: String,
    createdByUserName: { type: String, default: "Admin" },
    createdByUserRole: { type: String, enum: ["admin", "user"], default: "admin" },
    createdAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const NoteSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    type: { type: String, enum: noteTypes, default: "General" },
    createdByUserId: String,
    createdByUserName: String,
    createdByUserRole: { type: String, enum: ["admin", "user"] },
    sharedWith: { type: [String], default: [] },
    lineMeta: { type: [NoteLineMetaSchema], default: [] },
    manualDateTime: Date,
    followUpDateTime: Date,
    images: { type: [AssetSchema], default: [] },
    tags: { type: [String], default: [] },
    pinned: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const ProjectSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    clientName: { type: String, trim: true, default: "" },
    clientPhone: { type: String, trim: true, default: "" },
    clientEmail: { type: String, trim: true, default: "" },
    companyName: { type: String, trim: true },
    type: { type: String, enum: projectTypes, default: "Website" },
    description: { type: String, default: "" },
    budget: { type: Number, default: 0 },
    advanceReceived: { type: Number, default: 0 },
    remainingPayment: { type: Number, default: 0 },
    status: { type: String, enum: projectStatuses, default: "Pending" },
    priority: { type: String, enum: priorities, default: "Medium" },
    startDate: Date,
    deadlineDate: Date,
    techStack: { type: [String], default: [] },
    links: {
      github: String,
      figma: String,
      live: String,
      admin: String,
      other: String
    },
    coverImage: AssetSchema,
    ownerUserId: String,
    ownerUserName: String,
    ownerUserRole: { type: String, enum: ["admin", "user"] },
    sharedWith: { type: [String], default: [] },
    notes: { type: [NoteSchema], default: [] }
  },
  { timestamps: true }
);

ProjectSchema.index({ title: "text", clientName: "text", techStack: "text" });

const UserSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, trim: true, lowercase: true },
    displayName: { type: String, required: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["admin", "user"], default: "user" }
  },
  { timestamps: true }
);

export const ProjectModel =
  (models.Project as mongoose.Model<mongoose.Document>) || model("Project", ProjectSchema);

export const UserModel =
  (models.User as mongoose.Model<mongoose.Document>) || model("User", UserSchema);
