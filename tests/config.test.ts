import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getPublicConfig,
  normalizeConfigFile,
  normalizeEditableConfigInput,
  saveAdminPasswordHash,
  saveEditableConfig,
} from "../lib/config";
import { ValidationError } from "../lib/errors";
import { isPasswordHash, verifyPassword } from "../lib/password";

test("normalizeConfigFile parses auth.cookieSecure as an optional boolean", () => {
  assert.equal(normalizeConfigFile({ auth: { cookieSecure: true } }).cookieSecure, true);
  assert.equal(normalizeConfigFile({ auth: { cookieSecure: "false" } }).cookieSecure, false);
  assert.equal(normalizeConfigFile({ auth: { cookieSecure: "auto" } }).cookieSecure, undefined);
  assert.equal(normalizeConfigFile({ auth: {} }).cookieSecure, undefined);
  assert.throws(() => normalizeConfigFile({ auth: { cookieSecure: "yes" } }), ValidationError);
});

test("saveEditableConfig preserves auth.cookieSecure not exposed in the web form", async () => {
  const previousCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-admin-config-"));

  try {
    process.chdir(tempDir);
    await fs.writeFile(
      path.join(tempDir, "config.yaml"),
      ["auth:", "  adminPassword: scrypt:v1:salt:hash", "  cookieSecure: false", ""].join("\n"),
      "utf8",
    );

    await saveEditableConfig({
      dataDir: "./data",
      repoUrl: "https://github.com/example/blog.git",
      repoBranch: "main",
      gitAuthorName: "Writer Admin",
      gitAuthorEmail: "writer@example.com",
      githubToken: "ghp_secret",
      socksProxy: "",
      sessionTtlHours: 168,
      siteTimezoneOffset: "+08:00",
    });

    const source = await fs.readFile(path.join(tempDir, "config.yaml"), "utf8");
    assert.match(source, /cookieSecure: false/);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test("normalizeEditableConfigInput validates config and treats empty secrets as unchanged", () => {
  const normalized = normalizeEditableConfigInput({
    adminPassword: " ",
    dataDir: " ./data ",
    repoUrl: " https://github.com/example/blog.git ",
    repoBranch: "main",
    gitAuthorName: " Writer Admin ",
    gitAuthorEmail: "writer@example.com",
    githubToken: "",
    socksProxy: " socks5://127.0.0.1:1080 ",
    sessionTtlHours: "168",
    siteTimezoneOffset: "+08:00",
  });

  assert.equal(normalized.adminPassword, undefined);
  assert.match(normalized.dataDir, /data$/);
  assert.equal(normalized.repoUrl, "https://github.com/example/blog.git");
  assert.equal(normalized.gitAuthorName, "Writer Admin");
  assert.equal(normalized.githubToken, undefined);
  assert.equal(normalized.socksProxy, "socks5://127.0.0.1:1080");
  assert.equal(normalized.sessionTtlHours, 168);
});

test("normalizeEditableConfigInput rejects invalid values", () => {
  assert.throws(
    () =>
      normalizeEditableConfigInput({
        repoUrl: "http://github.com/example/blog.git",
        dataDir: "./data",
        repoBranch: "main",
        gitAuthorName: "Writer Admin",
        gitAuthorEmail: "writer@example.com",
        sessionTtlHours: 168,
        siteTimezoneOffset: "+08:00",
      }),
    ValidationError,
  );

  assert.throws(
    () =>
      normalizeEditableConfigInput({
        repoUrl: "https://github.com/example/blog.git",
        dataDir: "./data",
        repoBranch: "bad branch",
        gitAuthorName: "Writer Admin",
        gitAuthorEmail: "writer@example.com",
        sessionTtlHours: 168,
        siteTimezoneOffset: "+08:00",
      }),
    ValidationError,
  );

  assert.throws(
    () =>
      normalizeEditableConfigInput({
        repoUrl: "https://github.com/example/blog.git",
        dataDir: "./data",
        repoBranch: "main",
        gitAuthorName: "Writer Admin",
        gitAuthorEmail: "writer@example.com",
        socksProxy: "socks5h://127.0.0.1:7890",
        sessionTtlHours: 168,
        siteTimezoneOffset: "+08:00",
      }),
    ValidationError,
  );

  assert.throws(
    () =>
      normalizeEditableConfigInput({
        repoUrl: "https://github.com/example/blog.git",
        dataDir: "./data",
        repoBranch: "main",
        gitAuthorName: "Writer Admin",
        gitAuthorEmail: "writer@example.com",
        sessionTtlHours: 0,
        siteTimezoneOffset: "+08:00",
      }),
    ValidationError,
  );
});

test("normalizeConfigFile accepts partial YAML config and fills defaults later", () => {
  const normalized = normalizeConfigFile({
    auth: {
      adminPassword: "secret-password",
    },
    storage: {
      dataDir: "./data",
    },
    repository: {
      url: "https://github.com/example/blog.git",
      githubToken: "ghp_secret",
    },
    network: {
      socksProxy: "socks5://127.0.0.1:1080",
    },
  });

  assert.equal(normalized.adminPassword, "secret-password");
  assert.match(normalized.dataDir!, /data$/);
  assert.equal(normalized.socksProxy, "socks5://127.0.0.1:1080");
  assert.equal(normalized.repoBranch, undefined);
});

test("getPublicConfig reads config.yaml without exposing secrets", async () => {
  const previousCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-admin-config-"));

  try {
    process.chdir(tempDir);
    await fs.writeFile(
      path.join(tempDir, "config.yaml"),
      [
        "auth:",
        "  adminPassword: secret-password",
        "  sessionTtlHours: 24",
        "storage:",
        "  dataDir: ./data",
        "repository:",
        "  url: https://github.com/example/blog.git",
        "  branch: main",
        "  githubToken: ghp_secret",
        "network:",
        "  socksProxy: socks5://127.0.0.1:1080",
        "git:",
        "  authorName: Writer Admin",
        "  authorEmail: writer@example.com",
        "site:",
        '  timezoneOffset: "+08:00"',
        "",
      ].join("\n"),
      "utf8",
    );

    const publicConfig = getPublicConfig();

    assert.equal(publicConfig.repoUrl, "https://github.com/example/blog.git");
    assert.equal(publicConfig.socksProxy, "socks5://127.0.0.1:1080");
    assert.equal(publicConfig.hasAdminPassword, true);
    assert.equal(publicConfig.hasGithubToken, true);
    assert.equal("adminPassword" in publicConfig, false);
    assert.equal("githubToken" in publicConfig, false);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test("saveEditableConfig writes grouped YAML config", async () => {
  const previousCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-admin-config-"));

  try {
    process.chdir(tempDir);

    await saveEditableConfig({
      adminPassword: "secret-password",
      dataDir: "./data",
      repoUrl: "https://github.com/example/blog.git",
      repoBranch: "main",
      gitAuthorName: "Writer Admin",
      gitAuthorEmail: "writer@example.com",
      githubToken: "ghp_secret",
      socksProxy: "socks5://127.0.0.1:1080",
      sessionTtlHours: 24,
      siteTimezoneOffset: "+08:00",
    });

    const source = await fs.readFile(path.join(tempDir, "config.yaml"), "utf8");

    assert.match(source, /^auth:\n/m);
    assert.match(source, /^repository:\n/m);
    assert.match(source, /^network:\n/m);
    assert.doesNotMatch(source, /secret-password/);
    assert.doesNotMatch(source, /^repoUrl:/m);
    assert.doesNotMatch(source, /^githubToken:/m);

    const savedConfig = normalizeConfigFile({
      auth: {
        adminPassword: source.match(/adminPassword: (.+)/)?.[1],
      },
    });

    assert.ok(savedConfig.adminPassword);
    assert.equal(isPasswordHash(savedConfig.adminPassword), true);
    assert.equal(await verifyPassword("secret-password", savedConfig.adminPassword), true);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test("saveAdminPasswordHash only updates password hash in YAML config", async () => {
  const previousCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-admin-config-"));

  try {
    process.chdir(tempDir);
    await fs.writeFile(
      path.join(tempDir, "config.yaml"),
      [
        "auth:",
        "  adminPassword: plaintext-password",
        "  sessionTtlHours: 24",
        "storage:",
        "  dataDir: ./data",
        "",
      ].join("\n"),
      "utf8",
    );

    await saveAdminPasswordHash("scrypt:v1:salt:hash");

    const source = await fs.readFile(path.join(tempDir, "config.yaml"), "utf8");

    assert.match(source, /adminPassword: scrypt:v1:salt:hash/);
    assert.match(source, /dataDir: \.\/data/);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});
