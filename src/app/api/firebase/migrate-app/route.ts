import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";
import { migrateLocalDataToFirebaseApp } from "@/lib/store";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  try {
    const result = await migrateLocalDataToFirebaseApp();
    const ok = Object.values(result.checks).every(Boolean);
    return NextResponse.json({ ok, ...result }, { status: ok ? 200 : 500 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Firebase app migration failed"
      },
      { status: 500 }
    );
  }
}
