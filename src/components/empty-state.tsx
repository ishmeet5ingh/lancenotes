import Link from "next/link";
import { BriefcaseBusiness, Plus } from "lucide-react";

export function EmptyState({ title = "No projects found", action = true }: { title?: string; action?: boolean }) {
  return (
    <div className="surface grid place-items-center px-6 py-12 text-center">
      <div className="grid size-10 place-items-center rounded-md border border-blue-100 bg-blue-50 text-brand">
        <BriefcaseBusiness size={20} />
      </div>
      <h2 className="mt-3 text-lg font-black text-ink">{title}</h2>
      {action ? (
        <Link href="/projects/new" className="btn-primary mt-4">
          <Plus size={16} />
          Add Project
        </Link>
      ) : null}
    </div>
  );
}
