import { lookup } from "mime-types";

import { requireApiSession } from "@/lib/auth";
import { handleRouteError } from "@/lib/http";
import { readPostAsset } from "@/lib/posts";

type RouteContext = {
  params: Promise<{
    slug: string;
    assetPath: string[];
  }>;
};

export async function GET(_: Request, context: RouteContext) {
  try {
    await requireApiSession();
    const { slug, assetPath } = await context.params;
    const file = await readPostAsset(slug, assetPath);
    const contentType = lookup(assetPath[assetPath.length - 1]) || "application/octet-stream";

    return new Response(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "private, max-age=60",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
