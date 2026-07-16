import { requireApiSession } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/http";
import { publishRepoChanges } from "@/lib/repo";
import { normalizeSlug } from "@/lib/validation";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(_: Request, context: RouteContext) {
  try {
    await requireApiSession();
    const { slug } = await context.params;
    const normalizedSlug = normalizeSlug(slug);
    const publish = await publishRepoChanges(`post: update ${normalizedSlug}`, [
      `content/posts/${normalizedSlug}`,
    ]);

    return jsonOk({ publish });
  } catch (error) {
    return handleRouteError(error);
  }
}
