import fs from "node:fs/promises";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { getConfig } from "@/lib/config";
import { AppError } from "@/lib/errors";

const execFileAsync = promisify(execFile);

type RepoQueue = {
  chain: Promise<unknown>;
};

export type RepoSyncResult = {
  cloned: boolean;
  pulled: boolean;
  skipped: boolean;
  reason?: "localChanges";
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

async function runGit(args: string[], cwd: string) {
  try {
    const result = await execFileAsync("git", args, {
      cwd,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: "0",
      },
      maxBuffer: 1024 * 1024 * 8,
    });

    return {
      stdout: result.stdout.trim(),
      stderr: result.stderr.trim(),
    };
  } catch (error) {
    const message =
      error instanceof Error && "stderr" in error && typeof error.stderr === "string"
        ? error.stderr.trim() || error.message
        : error instanceof Error
          ? error.message
          : "Git command failed";

    throw new AppError(message);
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
