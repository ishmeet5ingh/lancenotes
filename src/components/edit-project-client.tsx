"use client";

import { useEffect, useState } from "react";
import { EmptyState } from "./empty-state";
import { ProjectForm } from "./project-form";
import type { Project } from "@/lib/types";

export function EditProjectClient({ id }: { id: string }) {
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/projects/${id}`)
      .then((response) => response.json())
      .then((data) => setProject(data.project ?? null))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return <div className="surface h-96 animate-pulse" />;
  if (!project) return <EmptyState title="Project not found" action={false} />;
  return <ProjectForm project={project} mode="edit" />;
}
