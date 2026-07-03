import { clearSession } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/http";

export async function POST() {
  try {
    await clearSession();
    return jsonOk({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
