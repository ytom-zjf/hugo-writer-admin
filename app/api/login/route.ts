import { issueSession } from "@/lib/auth";
import { isOperationalConfigComplete } from "@/lib/config";
import { handleRouteError, jsonOk } from "@/lib/http";

function getLoginRateLimitKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || "local";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { password?: string };
    const password = payload.password?.trim() || "";

    await issueSession(password, getLoginRateLimitKey(request));

    return jsonOk({
      ok: true,
      redirectTo: isOperationalConfigComplete() ? "/posts" : "/config",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
