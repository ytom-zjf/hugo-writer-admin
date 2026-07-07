import { randomBytes } from "node:crypto";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { getSessionConfig, saveAdminPasswordHash } from "@/lib/config";
import { AuthError, ConfigError, RateLimitError } from "@/lib/errors";
import { createSession, deleteSession, findSession } from "@/lib/db";
import { hashPassword, isPasswordHash, verifyPassword } from "@/lib/password";

type LoginAttempt = {
  failures: number;
  firstFailedAt: number;
  lockedUntil: number;
};

const MAX_LOGIN_FAILURES = 5;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;

const globalLoginAttempts = globalThis as typeof globalThis & {
  __writerAdminLoginAttempts?: Map<string, LoginAttempt>;
};

function getLoginAttempts() {
  if (!globalLoginAttempts.__writerAdminLoginAttempts) {
    globalLoginAttempts.__writerAdminLoginAttempts = new Map();
  }

  return globalLoginAttempts.__writerAdminLoginAttempts;
}

function assertLoginAllowed(rateLimitKey: string) {
  const attempts = getLoginAttempts();
  const current = attempts.get(rateLimitKey);
  const now = Date.now();

  if (!current) {
    return;
  }

  if (current.lockedUntil > now) {
    throw new RateLimitError("登录失败次数过多，请稍后再试");
  }

  if (now - current.firstFailedAt > LOGIN_FAILURE_WINDOW_MS) {
    attempts.delete(rateLimitKey);
  }
}

function recordLoginFailure(rateLimitKey: string) {
  const attempts = getLoginAttempts();
  const now = Date.now();
  const current = attempts.get(rateLimitKey);
  const base =
    current && now - current.firstFailedAt <= LOGIN_FAILURE_WINDOW_MS
      ? current
      : {
          failures: 0,
          firstFailedAt: now,
          lockedUntil: 0,
        };

  const nextFailures = base.failures + 1;
  attempts.set(rateLimitKey, {
    failures: nextFailures,
    firstFailedAt: base.firstFailedAt,
    lockedUntil: nextFailures >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCK_MS : 0,
  });
}

function clearLoginFailures(rateLimitKey: string) {
  getLoginAttempts().delete(rateLimitKey);
}

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

export async function issueSession(password: string, rateLimitKey = "local") {
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
