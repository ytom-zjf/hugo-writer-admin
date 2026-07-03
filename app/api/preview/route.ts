import { requireApiSession } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/http";
import { renderPreview } from "@/lib/preview";

export async function POST(request: Request) {
  try {
    await requireApiSession();
    const payload = (await request.json()) as { markdown?: string };
    const html = await renderPreview(payload.markdown ?? "");
    return jsonOk({ html });
  } catch (error) {
    return handleRouteError(error);
  }
}
