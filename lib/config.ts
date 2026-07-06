import fs from "node:fs";
import fsPromises from "node:fs/promises";
import path from "node:path";

import { parse, stringify } from "yaml";

import { AppError, ConfigError, ValidationError } from "@/lib/errors";

type RuntimeConfig = {
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

type EditableRuntimeConfig = Pick<
  RuntimeConfig,
  | "adminPassword"
  | "dataDir"
  | "repoUrl"
  | "repoBranch"
  | "gitAuthorName"
  | "gitAuthorEmail"
  | "githubToken"
  | "sessionTtlHours"
  | "siteTimezoneOffset"
>;

export type PublicRuntimeConfig = Omit<RuntimeConfig, "adminPassword" | "githubToken"> & {
  configPath: string;
  hasAdminPassword: boolean;
  hasGithubToken: boolean;
};

type StorageRuntimeConfig = Pick<RuntimeConfig, "dataDir" | "dbPath">;
type SessionRuntimeConfig = Pick<
  RuntimeConfig,
  "sessionCookieName" | "sessionTtlHours"
> & {
  adminPassword?: string;
};

type StoredRuntimeConfig = Partial<EditableRuntimeConfig>;
type ResolvedRuntimeConfig = Omit<RuntimeConfig, "adminPassword" | "repoUrl" | "gitAuthorName" | "gitAuthorEmail" | "githubToken"> &
  Partial<Pick<RuntimeConfig, "adminPassword" | "repoUrl" | "gitAuthorName" | "gitAuthorEmail" | "githubToken">>;

const CONFIG_FILE_NAME = "config.yaml";
const OFFSET_PATTERN = /^([+-])(?:0\d|1\d|2[0-3]):[0-5]\d$/;
const DEFAULT_WORKSPACE_DIRECTORY = "./data";
const DEFAULT_REPO_BRANCH = "main";
const DEFAULT_SESSION_COOKIE_NAME = "writer_admin_session";
const DEFAULT_SESSION_LIFETIME_HOURS = 24 * 7;
const DEFAULT_TIMEZONE_OFFSET = "+08:00";

function getConfigFilePath() {
  return path.resolve(process.cwd(), CONFIG_FILE_NAME);
}

function resolveProjectPath(rawValue: string) {
  return path.isAbsolute(rawValue) ? rawValue : path.resolve(process.cwd(), rawValue);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function optionalObject(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (!isPlainObject(value)) {
    throw new ValidationError(`${fieldName} must be a YAML object`);
  }

  return value;
}

function normalizeRequiredString(value: unknown, fieldName: string) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new ValidationError(`${fieldName} is required`);
  }

  return value.trim();
}

function normalizeOptionalString(value: unknown, fieldName: string) {
  if (value === undefined) {
    return undefined;
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return undefined;
  }

  return normalizeRequiredString(value, fieldName);
}

function normalizeDataDir(value: unknown) {
  return resolveProjectPath(normalizeRequiredString(value, "dataDir"));
}

function normalizeOptionalDataDir(value: unknown) {
  return value === undefined ? undefined : normalizeDataDir(value);
}

function normalizeRepoUrl(value: unknown) {
  const normalized = normalizeRequiredString(value, "repoUrl");

  let parsed: URL;

  try {
    parsed = new URL(normalized);
  } catch {
    throw new ValidationError("repoUrl must be a valid URL");
  }

  if (parsed.protocol !== "https:") {
    throw new ValidationError("repoUrl must use https");
  }

  return normalized;
}

function normalizeOptionalRepoUrl(value: unknown) {
  return value === undefined ? undefined : normalizeRepoUrl(value);
}

function normalizeRepoBranch(value: unknown) {
  const normalized = normalizeRequiredString(value, "repoBranch");

  if (
    normalized.includes("..") ||
    normalized.endsWith(".lock") ||
    normalized.startsWith("/") ||
    normalized.endsWith("/") ||
    /[\s~^:?*[\\\x00-\x1f\x7f]/.test(normalized)
  ) {
    throw new ValidationError("repoBranch is not a valid branch name");
  }

  return normalized;
}

function normalizeGitAuthorEmail(value: unknown) {
  const normalized = normalizeRequiredString(value, "gitAuthorEmail");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ValidationError("gitAuthorEmail must be a valid email address");
  }

  return normalized;
}

function normalizeOptionalGitAuthorEmail(value: unknown) {
  return value === undefined ? undefined : normalizeGitAuthorEmail(value);
}

function normalizeSessionTtlHours(value: unknown): number {
  const numberValue = typeof value === "string" && value.trim().length > 0 ? Number(value) : value;

  if (
    typeof numberValue !== "number" ||
    !Number.isInteger(numberValue) ||
    numberValue <= 0 ||
    numberValue > 24 * 365
  ) {
    throw new ValidationError("sessionTtlHours must be an integer between 1 and 8760");
  }

  return numberValue;
}

function normalizeTimezoneOffset(value: unknown) {
  const normalized = normalizeRequiredString(value, "siteTimezoneOffset");

  if (!OFFSET_PATTERN.test(normalized)) {
    throw new ValidationError("siteTimezoneOffset must look like +08:00");
  }

  return normalized;
}

function normalizeOptionalTimezoneOffset(value: unknown) {
  return value === undefined ? undefined : normalizeTimezoneOffset(value);
}

export function normalizeConfigFile(input: unknown): StoredRuntimeConfig {
  if (input === null || input === undefined) {
    return {};
  }

  if (!isPlainObject(input)) {
    throw new ValidationError("config.yaml must contain a YAML object");
  }

  const auth = optionalObject(input.auth, "auth");
  const storage = optionalObject(input.storage, "storage");
  const repository = optionalObject(input.repository, "repository");
  const git = optionalObject(input.git, "git");
  const site = optionalObject(input.site, "site");

  return {
    adminPassword: normalizeOptionalString(auth?.adminPassword, "auth.adminPassword"),
    dataDir: normalizeOptionalDataDir(storage?.dataDir),
    repoUrl: normalizeOptionalRepoUrl(repository?.url),
    repoBranch: repository?.branch === undefined ? undefined : normalizeRepoBranch(repository.branch),
    gitAuthorName: normalizeOptionalString(git?.authorName, "git.authorName"),
    gitAuthorEmail: normalizeOptionalGitAuthorEmail(git?.authorEmail),
    githubToken: normalizeOptionalString(repository?.githubToken, "repository.githubToken"),
    sessionTtlHours:
      auth?.sessionTtlHours === undefined ? undefined : normalizeSessionTtlHours(auth.sessionTtlHours),
    siteTimezoneOffset: normalizeOptionalTimezoneOffset(site?.timezoneOffset),
  };
}

export function normalizeEditableConfigInput(input: unknown) {
  if (!isPlainObject(input)) {
    throw new ValidationError("Request body must be a JSON object");
  }

  return {
    adminPassword: normalizeOptionalString(input.adminPassword, "adminPassword"),
    dataDir: normalizeDataDir(input.dataDir),
    repoUrl: normalizeRepoUrl(input.repoUrl),
    repoBranch: normalizeRepoBranch(input.repoBranch),
    gitAuthorName: normalizeRequiredString(input.gitAuthorName, "gitAuthorName"),
    gitAuthorEmail: normalizeGitAuthorEmail(input.gitAuthorEmail),
    githubToken: normalizeOptionalString(input.githubToken, "githubToken"),
    sessionTtlHours: normalizeSessionTtlHours(input.sessionTtlHours),
    siteTimezoneOffset: normalizeTimezoneOffset(input.siteTimezoneOffset),
  } satisfies Partial<EditableRuntimeConfig> & Omit<EditableRuntimeConfig, "adminPassword" | "githubToken">;
}

function parseConfigYaml(source: string) {
  try {
    return normalizeConfigFile(parse(source));
  } catch (error) {
    if (error instanceof ValidationError) {
      throw new AppError(`config.yaml is invalid: ${error.message}`);
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    throw new AppError(`Failed to parse config.yaml: ${message}`);
  }
}

function readYamlConfig(): StoredRuntimeConfig {
  const filePath = getConfigFilePath();

  if (!fs.existsSync(filePath)) {
    return {};
  }

  try {
    return parseConfigYaml(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    throw new AppError(`Failed to read config.yaml: ${message}`);
  }
}

function resolveConfig(storedConfig: StoredRuntimeConfig): ResolvedRuntimeConfig {
  const dataDir = storedConfig.dataDir ?? resolveProjectPath(DEFAULT_WORKSPACE_DIRECTORY);

  return {
    adminPassword: storedConfig.adminPassword,
    dataDir,
    dbPath: path.join(dataDir, "writer-admin.sqlite"),
    repoDir: path.join(dataDir, "repo"),
    repoUrl: storedConfig.repoUrl,
    repoBranch: storedConfig.repoBranch ?? DEFAULT_REPO_BRANCH,
    gitAuthorName: storedConfig.gitAuthorName,
    gitAuthorEmail: storedConfig.gitAuthorEmail,
    githubToken: storedConfig.githubToken,
    sessionCookieName: DEFAULT_SESSION_COOKIE_NAME,
    sessionTtlHours: storedConfig.sessionTtlHours ?? DEFAULT_SESSION_LIFETIME_HOURS,
    siteTimezoneOffset: storedConfig.siteTimezoneOffset ?? DEFAULT_TIMEZONE_OFFSET,
  };
}

function withoutUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value.map((item) => withoutUndefined(item)) as T;
  }

  if (!isPlainObject(value)) {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .map(([key, entryValue]) => [key, withoutUndefined(entryValue)]),
  ) as T;
}

function toYamlConfig(config: StoredRuntimeConfig) {
  const groupedConfig = withoutUndefined({
    auth: {
      adminPassword: config.adminPassword,
      sessionTtlHours: config.sessionTtlHours,
    },
    storage: {
      dataDir: config.dataDir,
    },
    repository: {
      url: config.repoUrl,
      branch: config.repoBranch,
      githubToken: config.githubToken,
    },
    git: {
      authorName: config.gitAuthorName,
      authorEmail: config.gitAuthorEmail,
    },
    site: {
      timezoneOffset: config.siteTimezoneOffset,
    },
  });

  return stringify(groupedConfig, {
    lineWidth: 0,
    singleQuote: false,
  });
}

export function getConfig(): RuntimeConfig {
  const config = resolveConfig(readYamlConfig());
  const requiredConfigEntries: Array<[string, string | undefined]> = [
    ["auth.adminPassword", config.adminPassword],
    ["repository.url", config.repoUrl],
    ["repository.githubToken", config.githubToken],
    ["git.authorName", config.gitAuthorName],
    ["git.authorEmail", config.gitAuthorEmail],
  ];
  const missingKeys = requiredConfigEntries.filter(([, value]) => !value).map(([key]) => key);

  if (missingKeys.length > 0) {
    throw new ConfigError(missingKeys);
  }

  return {
    ...config,
    adminPassword: config.adminPassword!,
    repoUrl: config.repoUrl!,
    gitAuthorName: config.gitAuthorName!,
    gitAuthorEmail: config.gitAuthorEmail!,
    githubToken: config.githubToken!,
  };
}

export function getStorageConfig(): StorageRuntimeConfig {
  const config = resolveConfig(readYamlConfig());

  return {
    dataDir: config.dataDir,
    dbPath: config.dbPath,
  };
}

export function getSessionConfig(): SessionRuntimeConfig {
  const config = resolveConfig(readYamlConfig());

  return {
    adminPassword: config.adminPassword,
    sessionCookieName: config.sessionCookieName,
    sessionTtlHours: config.sessionTtlHours,
  };
}

export function getPublicConfig(): PublicRuntimeConfig {
  const config = resolveConfig(readYamlConfig());

  return {
    dataDir: config.dataDir,
    dbPath: config.dbPath,
    repoDir: config.repoDir,
    repoUrl: config.repoUrl ?? "",
    repoBranch: config.repoBranch,
    gitAuthorName: config.gitAuthorName ?? "",
    gitAuthorEmail: config.gitAuthorEmail ?? "",
    sessionCookieName: config.sessionCookieName,
    sessionTtlHours: config.sessionTtlHours,
    siteTimezoneOffset: config.siteTimezoneOffset,
    configPath: getConfigFilePath(),
    hasAdminPassword: !!config.adminPassword,
    hasGithubToken: !!config.githubToken,
  };
}

export function isOperationalConfigComplete(config = getPublicConfig()) {
  return !!(config.repoUrl && config.gitAuthorName && config.gitAuthorEmail && config.hasGithubToken);
}

export async function saveEditableConfig(input: unknown) {
  const normalized = normalizeEditableConfigInput(input);
  const currentConfig = readYamlConfig();

  const nextConfig: StoredRuntimeConfig = {
    dataDir: normalized.dataDir,
    repoUrl: normalized.repoUrl,
    repoBranch: normalized.repoBranch,
    gitAuthorName: normalized.gitAuthorName,
    gitAuthorEmail: normalized.gitAuthorEmail,
    sessionTtlHours: normalized.sessionTtlHours,
    siteTimezoneOffset: normalized.siteTimezoneOffset,
  };

  if (normalized.adminPassword) {
    nextConfig.adminPassword = normalized.adminPassword;
  } else if (currentConfig.adminPassword) {
    nextConfig.adminPassword = currentConfig.adminPassword;
  }

  if (normalized.githubToken) {
    nextConfig.githubToken = normalized.githubToken;
  } else if (currentConfig.githubToken) {
    nextConfig.githubToken = currentConfig.githubToken;
  }

  const configFilePath = getConfigFilePath();
  await fsPromises.mkdir(path.dirname(configFilePath), { recursive: true });
  await fsPromises.writeFile(configFilePath, toYamlConfig(nextConfig), {
    encoding: "utf8",
    mode: 0o600,
  });

  return getPublicConfig();
}
