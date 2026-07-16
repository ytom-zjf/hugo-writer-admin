import { NextResponse } from "next/server";

import { AppError, ConfigError, ValidationError } from "@/lib/errors";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }
}

export function handleRouteError(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        ...(error instanceof ConfigError ? { missingKeys: error.missingKeys } : {}),
      },
      { status: error.status },
    );
  }

  console.error(error);

  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
