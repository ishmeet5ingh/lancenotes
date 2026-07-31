import crypto from "crypto";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { canEditLine } from "@/lib/permissions";
import { getProject, normalizedLineMetaForDescription } from "@/lib/store";

export const runtime = "nodejs";

type CloudinaryUploadResponse = {
  secure_url?: string;
  public_id?: string;
  width?: number;
  height?: number;
  error?: {
    message?: string;
  };
};

type CloudinaryDeleteResponse = {
  result?: string;
  error?: {
    message?: string;
  };
};

function signCloudinaryParams(params: Record<string, string>, apiSecret: string) {
  const signaturePayload = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");

  return crypto.createHash("sha1").update(`${signaturePayload}${apiSecret}`).digest("hex");
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Cloudinary is not configured" }, { status: 500 });
  }

  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Image file is required" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Only image files can be uploaded" }, { status: 400 });
  }

  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "Image must be 10MB or smaller" }, { status: 400 });
  }

  const timestamp = Math.round(Date.now() / 1000).toString();
  const uploadParams = {
    folder: "lancenotes/note-items",
    timestamp
  };
  const signature = signCloudinaryParams(uploadParams, apiSecret);
  const cloudinaryFormData = new FormData();
  cloudinaryFormData.append("file", file);
  cloudinaryFormData.append("api_key", apiKey);
  cloudinaryFormData.append("folder", uploadParams.folder);
  cloudinaryFormData.append("timestamp", timestamp);
  cloudinaryFormData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: "POST",
    body: cloudinaryFormData
  });
  const data = (await response.json()) as CloudinaryUploadResponse;

  if (!response.ok || !data.secure_url) {
    return NextResponse.json({ error: data.error?.message ?? "Unable to upload image" }, { status: 400 });
  }

  return NextResponse.json({
    image: {
      url: data.secure_url,
      publicId: data.public_id,
      width: data.width,
      height: data.height
    }
  });
}

export async function DELETE(request: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Cloudinary is not configured" }, { status: 500 });
  }

  const body = (await request.json().catch(() => null)) as { publicId?: unknown; projectId?: unknown; noteId?: unknown } | null;
  const publicId = typeof body?.publicId === "string" ? body.publicId.trim() : "";
  const projectId = typeof body?.projectId === "string" ? body.projectId.trim() : "";
  const noteId = typeof body?.noteId === "string" ? body.noteId.trim() : "";

  if (!publicId) {
    return NextResponse.json({ error: "Cloudinary public ID is required" }, { status: 400 });
  }
  if (!projectId || !noteId) {
    return NextResponse.json({ error: "Project and note are required" }, { status: 400 });
  }

  const project = await getProject(projectId);
  const note = project?.notes.find((item) => item._id === noteId);
  if (!project || !note) {
    return NextResponse.json({ error: "Note not found" }, { status: 404 });
  }
  const lines = note.description.length ? note.description.split("\n") : [""];
  const imageLineIndex = lines.findIndex((line) => line.includes(publicId));
  if (imageLineIndex === -1) {
    return NextResponse.json({ error: "Image is not attached to this note" }, { status: 403 });
  }
  const lineMeta = normalizedLineMetaForDescription(note.description, note.lineMeta)[imageLineIndex];
  if (!canEditLine(user, lineMeta)) {
    return NextResponse.json({ error: "You can only remove images from points you created" }, { status: 403 });
  }

  const timestamp = Math.round(Date.now() / 1000).toString();
  const deleteParams = {
    public_id: publicId,
    timestamp
  };
  const signature = signCloudinaryParams(deleteParams, apiSecret);
  const cloudinaryFormData = new FormData();
  cloudinaryFormData.append("public_id", publicId);
  cloudinaryFormData.append("api_key", apiKey);
  cloudinaryFormData.append("timestamp", timestamp);
  cloudinaryFormData.append("signature", signature);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`, {
    method: "POST",
    body: cloudinaryFormData
  });
  const data = (await response.json()) as CloudinaryDeleteResponse;

  if (!response.ok || (data.result !== "ok" && data.result !== "not found")) {
    return NextResponse.json({ error: data.error?.message ?? "Unable to delete image" }, { status: 400 });
  }

  return NextResponse.json({ deleted: true });
}
