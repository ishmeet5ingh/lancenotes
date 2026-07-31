"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
import Link from "next/link";
import type { Project, ProjectInput } from "@/lib/types";

const blankProject: ProjectInput = {
  title: "",
  clientName: "",
  clientPhone: "",
  clientEmail: "",
  companyName: "",
  type: "Other",
  description: "",
  budget: 0,
  advanceReceived: 0,
  remainingPayment: 0,
  status: "In Progress",
  priority: "Medium",
  startDate: "",
  deadlineDate: "",
  techStack: [],
  links: {},
  coverImage: undefined
};

export function ProjectForm({ project, mode = "create" }: { project?: Project; mode?: "create" | "edit" }) {
  const router = useRouter();
  const [title, setTitle] = useState(project?.title ?? "");
  const [saving, setSaving] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);

    const payload: ProjectInput = {
      ...(project
        ? {
            title: project.title,
            clientName: project.clientName,
            clientPhone: project.clientPhone,
            clientEmail: project.clientEmail,
            companyName: project.companyName ?? "",
            type: project.type,
            description: project.description,
            budget: project.budget,
            advanceReceived: project.advanceReceived,
            remainingPayment: project.remainingPayment,
            status: project.status,
            priority: project.priority,
            startDate: project.startDate,
            deadlineDate: project.deadlineDate,
            techStack: project.techStack,
            links: project.links,
            coverImage: project.coverImage
          }
        : blankProject),
      title: title.trim()
    };

    const response = await fetch(project && mode === "edit" ? `/api/projects/${project._id}` : "/api/projects", {
      method: project && mode === "edit" ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    setSaving(false);
    if (!response.ok) {
      alert(data.error ?? "Unable to save");
      return;
    }
    router.push(`/projects/${data.project._id}`);
    router.refresh();
  }

  return (
    <div className="mx-auto flex min-h-[70vh] max-w-lg items-center">
      <form onSubmit={submit} className="surface w-full p-5">
        <Link href="/projects" className="mb-6 inline-flex items-center gap-2 text-xs font-bold text-slate-500 hover:text-ink">
          <ArrowLeft size={15} />
          Notes
        </Link>
        <h1 className="text-2xl font-black tracking-tight text-ink">{mode === "edit" ? "Rename" : "Create a note space"}</h1>
        <p className="mt-1 text-sm text-slate-500">Enter a title. You can start adding notes right after this.</p>

        <label className="mt-6 block space-y-2">
          <span className="label">Title</span>
          <input
            autoFocus
            className="field"
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Client website notes"
          />
        </label>

        <button className="btn-primary mt-5 w-full" disabled={saving}>
          {saving ? <Loader2 className="animate-spin" size={16} /> : <Check size={16} />}
          {mode === "edit" ? "Save title" : "Create and start notes"}
        </button>
      </form>
    </div>
  );
}
