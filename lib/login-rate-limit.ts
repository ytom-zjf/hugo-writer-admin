import { RateLimitError } from "@/lib/errors";

type LoginAttempt = {
  failures: number;
  firstFailedAt: number;
  lockedUntil: number;
};

// Per-key limits cover the normal case; the global limit is a backstop against
// attackers who rotate spoofed x-forwarded-for values to get fresh buckets.
const MAX_LOGIN_FAILURES = 5;
const MAX_GLOBAL_LOGIN_FAILURES = 20;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_LOCK_MS = 15 * 60 * 1000;
const GLOBAL_ATTEMPT_KEY = "__global__";

const globalLoginAttempts = globalThis as typeof globalThis & {
  __writerAdminLoginAttempts?: Map<string, LoginAttempt>;
};

function getLoginAttempts() {
  if (!globalLoginAttempts.__writerAdminLoginAttempts) {
    globalLoginAttempts.__writerAdminLoginAttempts = new Map();
  }

  return globalLoginAttempts.__writerAdminLoginAttempts;
}

function isWindowExpired(attempt: LoginAttempt, now: number) {
  return attempt.lockedUntil <= now && now - attempt.firstFailedAt > LOGIN_FAILURE_WINDOW_MS;
}

function assertKeyAllowed(key: string, now: number) {
  const attempts = getLoginAttempts();
  const current = attempts.get(key);

  if (!current) {
    return;
  }

  if (current.lockedUntil > now) {
    throw new RateLimitError("登录失败次数过多，请稍后再试");
  }

  if (isWindowExpired(current, now)) {
    attempts.delete(key);
  }
}

function recordKeyFailure(key: string, maxFailures: number, now: number) {
  const attempts = getLoginAttempts();
  const current = attempts.get(key);
  const base =
    current && now - current.firstFailedAt <= LOGIN_FAILURE_WINDOW_MS
      ? current
      : {
          failures: 0,
          firstFailedAt: now,
          lockedUntil: 0,
        };

  const nextFailures = base.failures + 1;
  attempts.set(key, {
    failures: nextFailures,
    firstFailedAt: base.firstFailedAt,
    lockedUntil: nextFailures >= maxFailures ? now + LOGIN_LOCK_MS : 0,
  });
}

function pruneExpiredAttempts(now: number) {
  const attempts = getLoginAttempts();

  for (const [key, attempt] of attempts) {
    if (isWindowExpired(attempt, now)) {
      attempts.delete(key);
    }
  }
}

export function assertLoginAllowed(rateLimitKey: string, now = Date.now()) {
  assertKeyAllowed(GLOBAL_ATTEMPT_KEY, now);
  assertKeyAllowed(rateLimitKey, now);
}

export function recordLoginFailure(rateLimitKey: string, now = Date.now()) {
  pruneExpiredAttempts(now);
  recordKeyFailure(rateLimitKey, MAX_LOGIN_FAILURES, now);

  if (rateLimitKey !== GLOBAL_ATTEMPT_KEY) {
    recordKeyFailure(GLOBAL_ATTEMPT_KEY, MAX_GLOBAL_LOGIN_FAILURES, now);
  }
}

export function clearLoginFailures(rateLimitKey: string) {
  getLoginAttempts().delete(rateLimitKey);
}

export function resetLoginRateLimiter() {
  getLoginAttempts().clear();
}
