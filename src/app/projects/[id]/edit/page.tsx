import { EditProjectClient } from "@/components/edit-project-client";

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function EditProjectPage({ params }: PageProps) {
  const { id } = await params;
  return <EditProjectClient id={id} />;
}
