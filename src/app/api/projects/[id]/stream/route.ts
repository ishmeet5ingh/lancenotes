import { getCurrentUser } from "@/lib/auth";
import { canViewProject, projectForUser } from "@/lib/permissions";
import { getProject } from "@/lib/store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const encoder = new TextEncoder();

function streamEvent(payload: unknown) {
  return encoder.encode(`data: ${JSON.stringify(payload)}\n\n`);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request, context: RouteContext) {
  const user = await getCurrentUser();
  if (!user) return new Response("Login required", { status: 401 });
  const currentUser = user;

  const { id } = await context.params;
  const initialProject = await getProject(id);
  if (!initialProject) return new Response("Project not found", { status: 404 });
  if (!canViewProject(currentUser, initialProject)) return new Response("Access denied", { status: 403 });

  let closed = false;
  let previousPayload = "";

  const stream = new ReadableStream({
    start(controller) {
      request.signal.addEventListener("abort", () => {
        closed = true;
        try {
          controller.close();
        } catch {
          // The browser may already have closed the stream.
        }
      });

      async function sendUpdates() {
        while (!closed) {
          try {
            const project = await getProject(id);
            if (!project) {
              controller.enqueue(streamEvent({ deleted: true }));
              closed = true;
              controller.close();
              return;
            }

            if (!canViewProject(currentUser, project)) {
              controller.enqueue(streamEvent({ error: "Access denied" }));
              closed = true;
              controller.close();
              return;
            }

            const payload = JSON.stringify({ project: projectForUser(currentUser, project) });
            if (payload !== previousPayload) {
              previousPayload = payload;
              controller.enqueue(streamEvent(JSON.parse(payload)));
            }
          } catch {
            controller.enqueue(streamEvent({ error: "Unable to refresh project" }));
          }

          await sleep(1200);
        }
      }

      void sendUpdates();
    },
    cancel() {
      closed = true;
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive"
    }
  });
}
