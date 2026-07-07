import { assertRepoRemoteCurrent, publishRepoChanges } from "@/lib/repo";
import { requireApiSession } from "@/lib/auth";
import { deletePost, getPost, updatePost } from "@/lib/posts";
import { handleRouteError, jsonOk } from "@/lib/http";
import { normalizeSlug } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    await requireApiSession();
    const { slug } = await context.params;
    const post = await getPost(slug);
    return jsonOk({ post });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request, context: RouteContext) {
  try {
    await requireApiSession();
    const { slug } = await context.params;
    const payload = await request.json();
    const post = await updatePost(slug, payload);
    return jsonOk({ post });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_: Request, context: RouteContext) {
  try {
    await requireApiSession();
    const { slug } = await context.params;
    const normalizedSlug = normalizeSlug(slug);

    await assertRepoRemoteCurrent();
    await deletePost(normalizedSlug);

    const result = await publishRepoChanges(`post: delete ${normalizedSlug}`);
    return jsonOk({ ok: true, publish: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
