import { lookup } from "mime-types";

import { requireApiSession } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { handleRouteError, jsonOk } from "@/lib/http";
import { deletePostAsset, readPostAsset } from "@/lib/posts";

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

export async function DELETE(_: Request, context: RouteContext) {
  try {
    await requireApiSession();
    const { slug, assetPath } = await context.params;

    if (assetPath.length !== 1) {
      throw new ValidationError("Invalid asset path");
    }

    const result = await deletePostAsset(slug, assetPath[0]);
    return jsonOk({ ok: true, asset: result });
  } catch (error) {
    return handleRouteError(error);
  }
}
