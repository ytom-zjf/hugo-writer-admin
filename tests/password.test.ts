import test from "node:test";
import assert from "node:assert/strict";

import { hashPassword, isPasswordHash, verifyPassword } from "../lib/password";

test("hashPassword stores scrypt hashes and verifies passwords", async () => {
  const hash = await hashPassword("secret-password");

  assert.equal(isPasswordHash(hash), true);
  assert.equal(hash.includes("secret-password"), false);
  assert.equal(await verifyPassword("secret-password", hash), true);
  assert.equal(await verifyPassword("wrong-password", hash), false);
});

test("verifyPassword keeps legacy plaintext config compatible", async () => {
  assert.equal(await verifyPassword("legacy-password", "legacy-password"), true);
  assert.equal(await verifyPassword("wrong-password", "legacy-password"), false);
});

test("verifyPassword rejects malformed scrypt hashes", async () => {
  assert.equal(await verifyPassword("secret-password", "scrypt:v1:salt"), false);
  assert.equal(await verifyPassword("secret-password", "scrypt:v1:salt:hash:extra"), false);
});
