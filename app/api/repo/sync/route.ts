import { requireApiSession } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/http";
import { syncRepoIfClean } from "@/lib/repo";

export const runtime = "nodejs";

export async function POST() {
  try {
    await requireApiSession();
    const result = await syncRepoIfClean();
    return jsonOk({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
