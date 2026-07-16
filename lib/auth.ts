import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionConfig, saveAdminPasswordHash } from "@/lib/config";
import { AuthError, ConfigError } from "@/lib/errors";
import { createSession, deleteSession, findSession } from "@/lib/db";
import { assertLoginAllowed, clearLoginFailures, recordLoginFailure } from "@/lib/login-rate-limit";
import { hashPassword, isPasswordHash, verifyPassword } from "@/lib/password";

async function upgradeLegacyPasswordIfNeeded(password: string, storedValue: string) {
  if (isPasswordHash(storedValue)) {
    return;
  }

  try {
    await saveAdminPasswordHash(await hashPassword(password));
  } catch (error) {
    console.warn("Failed to upgrade admin password hash", error);
  }
}

export async function issueSession(
  password: string,
  rateLimitKey = "local",
  options: { secureCookie?: boolean } = {},
) {
  assertLoginAllowed(rateLimitKey);

  const config = getSessionConfig();

  if (!config.adminPassword) {
    throw new ConfigError(["auth.adminPassword"]);
  }

  if (!(await verifyPassword(password, config.adminPassword))) {
    recordLoginFailure(rateLimitKey);
    throw new AuthError("Password is incorrect");
  }

  clearLoginFailures(rateLimitKey);
  await upgradeLegacyPasswordIfNeeded(password, config.adminPassword);

  const sessionId = randomBytes(24).toString("hex");
  const expiresAt = Date.now() + config.sessionTtlHours * 60 * 60 * 1000;

  createSession(sessionId, expiresAt);

  const cookieStore = await cookies();
  cookieStore.set(config.sessionCookieName, sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.cookieSecure ?? options.secureCookie ?? process.env.NODE_ENV === "production",
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
