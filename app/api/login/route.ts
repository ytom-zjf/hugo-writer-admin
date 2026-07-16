import { issueSession } from "@/lib/auth";
import { isOperationalConfigComplete } from "@/lib/config";
import { handleRouteError, jsonOk, readJsonBody } from "@/lib/http";

function getLoginRateLimitKey(request: Request) {
  const forwardedFor = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwardedFor || request.headers.get("x-real-ip")?.trim() || "local";
}

function isSecureRequest(request: Request) {
  const forwardedProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();

  if (forwardedProto) {
    return forwardedProto === "https";
  }

  return new URL(request.url).protocol === "https:";
}

export async function POST(request: Request) {
  try {
    const payload = await readJsonBody(request);
    const password =
      payload && typeof payload === "object" && "password" in payload && typeof payload.password === "string"
        ? payload.password.trim()
        : "";

    await issueSession(password, getLoginRateLimitKey(request), {
      secureCookie: isSecureRequest(request),
    });

    return jsonOk({
      ok: true,
      redirectTo: isOperationalConfigComplete() ? "/posts" : "/config",
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
