import { issueSession } from "@/lib/auth";
import { isOperationalConfigComplete } from "@/lib/config";
import { handleRouteError, jsonOk } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { password?: string };
    const password = payload.password?.trim() || "";

    await issueSession(password);

    return jsonOk({
      ok: true,
      redirectTo: isOperationalConfigComplete() ? "/posts" : "/config",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
