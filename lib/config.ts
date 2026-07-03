import path from "node:path";

import { ConfigError } from "@/lib/errors";

export type RuntimeConfig = {
  adminPassword: string;
  dataDir: string;
  dbPath: string;
  repoDir: string;
  repoUrl: string;
  repoBranch: string;
  gitAuthorName: string;
  gitAuthorEmail: string;
  githubToken: string;
  sessionCookieName: string;
  sessionTtlHours: number;
  siteTimezoneOffset: string;
};

function resolveDataDir(rawValue: string | undefined) {
  if (!rawValue) {
    return path.resolve(process.cwd(), "data");
  }

  return path.isAbsolute(rawValue) ? rawValue : path.resolve(process.cwd(), rawValue);
}

function parsePositiveInt(rawValue: string | undefined, fallback: number) {
  if (!rawValue) {
    return fallback;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function getConfig(): RuntimeConfig {
  const missingKeys = [
    "ADMIN_PASSWORD",
    "REPO_URL",
    "GITHUB_TOKEN",
    "GIT_AUTHOR_NAME",
    "GIT_AUTHOR_EMAIL",
  ].filter((key) => !process.env[key]?.trim());

  if (missingKeys.length > 0) {
    throw new ConfigError(missingKeys);
  }

  const dataDir = resolveDataDir(process.env.DATA_DIR);

  return {
    adminPassword: process.env.ADMIN_PASSWORD!.trim(),
    dataDir,
    dbPath: path.join(dataDir, "writer-admin.sqlite"),
    repoDir: path.join(dataDir, "repo"),
    repoUrl: process.env.REPO_URL!.trim(),
    repoBranch: process.env.REPO_BRANCH?.trim() || "main",
    gitAuthorName: process.env.GIT_AUTHOR_NAME!.trim(),
    gitAuthorEmail: process.env.GIT_AUTHOR_EMAIL!.trim(),
    githubToken: process.env.GITHUB_TOKEN!.trim(),
    sessionCookieName: "writer_admin_session",
    sessionTtlHours: parsePositiveInt(process.env.SESSION_TTL_HOURS, 24 * 7),
    siteTimezoneOffset: process.env.SITE_TIMEZONE_OFFSET?.trim() || "+08:00",
  };
}
