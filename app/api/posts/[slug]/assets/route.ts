import { requireApiSession } from "@/lib/auth";
import { ValidationError } from "@/lib/errors";
import { handleRouteError, jsonOk } from "@/lib/http";
import { savePostAsset } from "@/lib/posts";

type RouteContext = {
  params: Promise<{
    slug: string;
  }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    await requireApiSession();
    const { slug } = await context.params;
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      throw new ValidationError("file is required");
    }

    const asset = await savePostAsset(slug, file);
    return jsonOk({ asset }, 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
