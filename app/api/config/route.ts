import { requireApiSession } from "@/lib/auth";
import { getPublicConfig, saveEditableConfig } from "@/lib/config";
import { handleRouteError, jsonOk, readJsonBody } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    await requireApiSession();
    return jsonOk({ config: getPublicConfig() });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PUT(request: Request) {
  try {
    await requireApiSession();
    const payload = await readJsonBody(request);
    const config = await saveEditableConfig(payload);
    return jsonOk({ config });
  } catch (error) {
    return handleRouteError(error);
  }
}
