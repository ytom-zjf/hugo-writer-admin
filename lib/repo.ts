import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getConfig } from "@/lib/config";
import { AppError, ConflictError } from "@/lib/errors";

const execFileAsync = promisify(execFile);
const GIT_COMMAND_TIMEOUT_MS = 120 * 1000;

type RepoQueue = {
  chain: Promise<unknown>;
};

export type RepoSyncResult = {
  cloned: boolean;
  pulled: boolean;
  skipped: boolean;
  reason?: "localChanges";
};

export type RepoRemoteStatus = {
  cloned: boolean;
  ahead: number;
  behind: number;
  hasLocalChanges: boolean;
};

const globalRepoQueue = globalThis as typeof globalThis & {
  __writerAdminRepoQueue?: RepoQueue;
};

function getQueue() {
  if (!globalRepoQueue.__writerAdminRepoQueue) {
    globalRepoQueue.__writerAdminRepoQueue = {
      chain: Promise.resolve(),
    };
  }

  return globalRepoQueue.__writerAdminRepoQueue;
}

function withRepoLock<T>(work: () => Promise<T>) {
  const queue = getQueue();
  const run = queue.chain.then(work, work);
  queue.chain = run.catch(() => undefined);
  return run;
}

function getAuthenticatedRepoUrl() {
  const config = getConfig();
  const url = new URL(config.repoUrl);

  if (url.protocol !== "https:") {
    throw new AppError("Only https Git remotes are supported");
  }

  url.username = "x-access-token";
  url.password = config.githubToken;
  return url.toString();
}

function buildGitEnv() {
  const config = getConfig();
  const proxyEnv = config.socksProxy
    ? {
        ALL_PROXY: config.socksProxy,
        all_proxy: config.socksProxy,
        HTTPS_PROXY: config.socksProxy,
        https_proxy: config.socksProxy,
        HTTP_PROXY: config.socksProxy,
        http_proxy: config.socksProxy,
      }
    : {};

  return {
    ...process.env,
    ...proxyEnv,
    GIT_TERMINAL_PROMPT: "0",
  };
}

export function redactSensitiveGitOutput(message: string, githubToken?: string) {
  let redacted = message.replace(/https:\/\/x-access-token:[^@\s]+@/g, "https://x-access-token:[redacted]@");

  if (githubToken) {
    redacted = redacted.replaceAll(githubToken, "[redacted]");
    redacted = redacted.replaceAll(encodeURIComponent(githubToken), "[redacted]");
  }

  return redacted;
}

async function runGit(args: string[], cwd: string) {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      env: buildGitEnv(),
      maxBuffer: 1024 * 1024 * 8,
      timeout: GIT_COMMAND_TIMEOUT_MS,
    });

    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    const config = getConfig();
    const timedOut =
      error instanceof Error &&
      (("signal" in error && error.signal === "SIGTERM") || ("killed" in error && error.killed === true));
    const message =
      timedOut
        ? `Git command timed out after ${GIT_COMMAND_TIMEOUT_MS / 1000}s`
        : error instanceof Error && "stderr" in error && typeof error.stderr === "string"
          ? error.stderr.trim() || error.message
          : error instanceof Error
            ? error.message
            : "Git command failed";

    throw new AppError(redactSensitiveGitOutput(message, config.githubToken));
  }
}

async function pathExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function configureRepo() {
  const config = getConfig();

  await runGit(["config", "user.name", config.gitAuthorName], config.repoDir);
  await runGit(["config", "user.email", config.gitAuthorEmail], config.repoDir);
  await runGit(["remote", "set-url", "origin", getAuthenticatedRepoUrl()], config.repoDir);
  await runGit(["checkout", config.repoBranch], config.repoDir);
}

async function cloneRepoIfNeeded() {
  const config = getConfig();
  const gitDir = path.join(config.repoDir, ".git");

  await fs.mkdir(config.dataDir, { recursive: true });

  if (await pathExists(gitDir)) {
    return false;
  }

  if (await pathExists(config.repoDir)) {
    await fs.rm(config.repoDir, { recursive: true, force: true });
  }

  await runGit(
    [
      "clone",
      "--branch",
      config.repoBranch,
      "--single-branch",
      getAuthenticatedRepoUrl(),
      config.repoDir,
    ],
    config.dataDir,
  );

  await configureRepo();
  return true;
}

async function workingTreeHasChanges() {
  const config = getConfig();
  const result = await runGit(["status", "--porcelain"], config.repoDir);
  return result.stdout.length > 0;
}

function getRemoteBranchRef() {
  return `refs/remotes/origin/${getConfig().repoBranch}`;
}

function getRemoteFetchRefspec() {
  const config = getConfig();
  return `+refs/heads/${config.repoBranch}:${getRemoteBranchRef()}`;
}

export function parseAheadBehindCount(output: string) {
  const parts = output.trim().split(/\s+/);
  const [aheadRaw, behindRaw] = parts;
  const ahead = Number(aheadRaw);
  const behind = Number(behindRaw);

  if (parts.length !== 2 || !Number.isInteger(ahead) || !Number.isInteger(behind) || ahead < 0 || behind < 0) {
    throw new AppError("Failed to read repository remote status");
  }

  return { ahead, behind };
}

async function fetchRemoteBranch() {
  const config = getConfig();
  await runGit(["fetch", "origin", getRemoteFetchRefspec()], config.repoDir);
}

async function readAheadBehind() {
  const config = getConfig();
  const result = await runGit(["rev-list", "--left-right", "--count", `HEAD...${getRemoteBranchRef()}`], config.repoDir);
  return parseAheadBehindCount(result.stdout);
}

async function getRepoRemoteStatusUnlocked(): Promise<RepoRemoteStatus> {
  const cloned = await cloneRepoIfNeeded();

  if (!cloned) {
    await configureRepo();
    await fetchRemoteBranch();
  }

  const hasLocalChanges = await workingTreeHasChanges();
  const counts = cloned ? { ahead: 0, behind: 0 } : await readAheadBehind();

  return {
    cloned,
    ...counts,
    hasLocalChanges,
  };
}

async function assertRepoRemoteCurrentUnlocked() {
  const status = await getRepoRemoteStatusUnlocked();

  if (status.behind > 0) {
    throw new ConflictError(
      status.hasLocalChanges
        ? "远端仓库已有更新，本地也有未发布更改；请先处理本地更改并同步后再发布"
        : "远端仓库已有更新，请先同步仓库后再发布",
    );
  }

  return status;
}

async function abortRebaseIfNeeded() {
  const config = getConfig();

  try {
    await runGit(["rebase", "--abort"], config.repoDir);
  } catch {
    // Ignore cleanup failures when there is no active rebase.
  }
}

export async function ensureRepoReady() {
  await withRepoLock(async () => {
    await cloneRepoIfNeeded();
  });
}

export async function getRepoRemoteStatus() {
  return withRepoLock(getRepoRemoteStatusUnlocked);
}

export async function assertRepoRemoteCurrent() {
  return withRepoLock(assertRepoRemoteCurrentUnlocked);
}

export async function syncRepoIfClean() {
  return withRepoLock(async (): Promise<RepoSyncResult> => {
    const config = getConfig();

    const cloned = await cloneRepoIfNeeded();

    if (cloned) {
      return {
        cloned,
        pulled: false,
        skipped: false,
      };
    }

    await configureRepo();

    if (await workingTreeHasChanges()) {
      return {
        cloned,
        pulled: false,
        skipped: true,
        reason: "localChanges",
      };
    }

    await runGit(["pull", "--ff-only", "origin", config.repoBranch], config.repoDir);

    return {
      cloned,
      pulled: true,
      skipped: false,
    };
  });
}

export async function publishRepoChanges(commitMessage: string) {
  return withRepoLock(async () => {
    const config = getConfig();

    const cloned = await cloneRepoIfNeeded();

    if (!cloned) {
      await configureRepo();
    }

    await assertRepoRemoteCurrentUnlocked();

    try {
      await runGit(["pull", "--rebase", "--autostash", "origin", config.repoBranch], config.repoDir);
    } catch (error) {
      await abortRebaseIfNeeded();
      throw error;
    }

    await runGit(["add", "--all"], config.repoDir);

    const staged = await runGit(["diff", "--cached", "--name-only"], config.repoDir);

    if (!staged.stdout) {
      return {
        committed: false,
        pushed: false,
      };
    }

    await runGit(["commit", "-m", commitMessage], config.repoDir);
    await runGit(["push", "origin", config.repoBranch], config.repoDir);

    return {
      committed: true,
      pushed: true,
    };
  });
}
