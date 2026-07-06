import { randomBytes, timingSafeEqual } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionConfig } from "@/lib/config";
import { AuthError, ConfigError } from "@/lib/errors";
import { createSession, deleteSession, findSession } from "@/lib/db";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export async function issueSession(password: string) {
  const config = getSessionConfig();

  if (!config.adminPassword) {
    throw new ConfigError(["auth.adminPassword"]);
  }

  if (!safeEqual(password, config.adminPassword)) {
    throw new AuthError("Password is incorrect");
  }

  const sessionId = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + config.sessionTtlHours * 60 * 60 * 1000;

  createSession(sessionId, expiresAt);

  const cookieStore = await cookies();
  cookieStore.set(config.sessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: new Date(expiresAt),
  });

  return { sessionId, expiresAt };
}

export async function clearSession() {
  const config = getSessionConfig();
  const cookieStore = await cookies();
  const token = cookieStore.get(config.sessionCookieName)?.value;

  if (token) {
    deleteSession(token);
  }

  cookieStore.delete(config.sessionCookieName);
}

export async function getSession() {
  const config = getSessionConfig();
  const cookieStore = await cookies();
  const token = cookieStore.get(config.sessionCookieName)?.value;

  if (!token) {
    return null;
  }

  return findSession(token);
}

export async function requirePageSession() {
  const session = await getSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export async function requireApiSession() {
  const session = await getSession();

  if (!session) {
    throw new AuthError();
  }

  return session;
}
