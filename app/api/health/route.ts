import { jsonOk } from "@/lib/http";
import { isOperationalConfigComplete } from "@/lib/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  let configured = false;

  try {
    configured = isOperationalConfigComplete();
  } catch {
    configured = false;
  }

  return jsonOk({ status: "ok", configured });
}
