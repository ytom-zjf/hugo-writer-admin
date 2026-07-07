import { requireApiSession } from "@/lib/auth";
import { handleRouteError, jsonOk } from "@/lib/http";
import { getRepoRemoteStatus } from "@/lib/repo";

export async function GET() {
  try {
    await requireApiSession();
    const result = await getRepoRemoteStatus();
    return jsonOk({ result });
  } catch (error) {
    return handleRouteError(error);
  }
}
