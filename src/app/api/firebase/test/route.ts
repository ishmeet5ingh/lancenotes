import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { createFirebaseTestPath, firebaseTestRequest } from "@/lib/firebase-rtdb";
import { isAdmin } from "@/lib/permissions";

export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Login required" }, { status: 401 });
  if (!isAdmin(user)) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  const path = createFirebaseTestPath();
  const sample = {
    createdAt: new Date().toISOString(),
    source: "lancenotes-firebase-safety-test",
    project: {
      title: "Sample Firebase Test Project",
      sharedWith: ["sample-user-id"]
    },
    note: {
      title: "Sample note",
      sharedWith: ["sample-user-id"]
    },
    points: {
      point_1: {
        text: "Admin-created sample point",
        createdByUserName: "Admin",
        createdByUserRole: "admin"
      },
      point_2: {
        text: "User-created sample point",
        createdByUserId: "sample-user-id",
        createdByUserName: "Sample User",
        createdByUserRole: "user"
      }
    }
  };

  try {
    await firebaseTestRequest(path, {
      method: "PUT",
      body: JSON.stringify(sample)
    });
    const readBack = await firebaseTestRequest<typeof sample>(path);
    await firebaseTestRequest(`${path}/status`, {
      method: "PUT",
      body: JSON.stringify("updated")
    });
    const updatedStatus = await firebaseTestRequest<string>(`${path}/status`);
    await firebaseTestRequest(path, {
      method: "DELETE"
    });
    const afterDelete = await firebaseTestRequest<null>(path);

    return NextResponse.json({
      ok: true,
      path: `/${path}`,
      checks: {
        wroteSample: true,
        readBackMatches: readBack.source === sample.source && readBack.points.point_2.createdByUserRole === "user",
        updatedStatus,
        deleted: afterDelete === null
      }
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        path: `/${path}`,
        error: error instanceof Error ? error.message : "Firebase test failed"
      },
      { status: 500 }
    );
  }
}
