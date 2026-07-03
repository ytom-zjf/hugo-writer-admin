import { NextResponse } from "next/server";

import { AppError, ConfigError } from "@/lib/errors";

export function jsonOk<T>(data: T, status = 200) {
  return NextResponse.json(data, { status });
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
