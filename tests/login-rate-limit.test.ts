import test from "node:test";
import assert from "node:assert/strict";

import { RateLimitError } from "../lib/errors";
import {
  assertLoginAllowed,
  clearLoginFailures,
  recordLoginFailure,
  resetLoginRateLimiter,
} from "../lib/login-rate-limit";

test("assertLoginAllowed locks a key after five failures", () => {
  resetLoginRateLimiter();
  const now = 1_000_000;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    assertLoginAllowed("1.2.3.4", now);
    recordLoginFailure("1.2.3.4", now);
  }

  assert.throws(() => assertLoginAllowed("1.2.3.4", now), RateLimitError);
});

test("clearLoginFailures unlocks a key after a successful login", () => {
  resetLoginRateLimiter();
  const now = 2_000_000;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordLoginFailure("5.6.7.8", now);
  }

  clearLoginFailures("5.6.7.8");
  assert.doesNotThrow(() => assertLoginAllowed("5.6.7.8", now));
});

test("global backstop blocks attackers rotating the rate-limit key", () => {
  resetLoginRateLimiter();
  const now = 3_000_000;

  // Each request uses a fresh spoofed key, so no per-key lock ever trips.
  for (let attempt = 0; attempt < 20; attempt += 1) {
    recordLoginFailure(`key-${attempt}`, now);
  }

  // A brand-new key is still refused because the global counter is exhausted.
  assert.throws(() => assertLoginAllowed("brand-new-key", now), RateLimitError);
});

test("lock expires after the failure window passes", () => {
  resetLoginRateLimiter();
  const now = 4_000_000;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    recordLoginFailure("9.9.9.9", now);
  }

  assert.throws(() => assertLoginAllowed("9.9.9.9", now), RateLimitError);

  const later = now + 15 * 60 * 1000 + 1;
  assert.doesNotThrow(() => assertLoginAllowed("9.9.9.9", later));
});
