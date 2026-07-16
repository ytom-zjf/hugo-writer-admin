import { requireApiSession } from "@/lib/auth";
import { createPost, listPosts } from "@/lib/posts";
import { handleRouteError, jsonOk, readJsonBody } from "@/lib/http";

export async function GET() {
  try {
    await requireApiSession();
    const posts = await listPosts();
    return jsonOk({ posts });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireApiSession();
    const payload = await readJsonBody(request);
    const post = await createPost(payload);
    return jsonOk({ post }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
