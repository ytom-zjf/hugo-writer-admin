import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { ConflictError, NotFoundError, ValidationError } from "../lib/errors";
import { getPost, listPosts, savePostAsset, updatePost } from "../lib/posts";

async function writeTestConfig(tempDir: string) {
  await fs.writeFile(
    path.join(tempDir, "config.yaml"),
    [
      "auth:",
      "  adminPassword: secret-password",
      "storage:",
      "  dataDir: ./data",
      "repository:",
      "  url: https://github.com/example/blog.git",
      "  branch: main",
      "  githubToken: ghp_secret",
      "git:",
      "  authorName: Writer Admin",
      "  authorEmail: writer@example.com",
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writePost(tempDir: string, slug: string, title: string, body: string) {
  const postDir = path.join(tempDir, "data", "repo", "content", "posts", slug);
  await fs.mkdir(postDir, { recursive: true });
  await fs.writeFile(
    path.join(postDir, "index.md"),
    [
      "+++",
      `title = "${title}"`,
      `slug = "${slug}"`,
      'date = "2026-07-03T12:00:00+08:00"',
      "draft = true",
      "tags = []",
      "categories = []",
      "+++",
      "",
      body,
      "",
    ].join("\n"),
    "utf8",
  );
}

test("listPosts reads post summaries concurrently and skips directories without index.md", async () => {
  const previousCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-admin-posts-"));

  try {
    process.chdir(tempDir);
    await writeTestConfig(tempDir);
    await fs.mkdir(path.join(tempDir, "data", "repo", ".git"), { recursive: true });
    await writePost(tempDir, "first-post", "First Post", "Body");
    await fs.mkdir(path.join(tempDir, "data", "repo", "content", "posts", "draft-assets"), { recursive: true });

    const posts = await listPosts();

    assert.equal(posts.length, 1);
    assert.equal(posts[0].slug, "first-post");
  } finally {
    process.chdir(previousCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test("savePostAsset rejects non-image extensions and writes images", async () => {
  const previousCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-admin-posts-"));

  try {
    process.chdir(tempDir);
    await writeTestConfig(tempDir);
    await fs.mkdir(path.join(tempDir, "data", "repo", ".git"), { recursive: true });
    await writePost(tempDir, "first-post", "First Post", "Body");

    await assert.rejects(
      () => savePostAsset("first-post", new File(["#!/bin/sh"], "evil.sh", { type: "text/plain" })),
      ValidationError,
    );

    const saved = await savePostAsset(
      "first-post",
      new File([new Uint8Array([1, 2, 3])], "diagram.png", { type: "image/png" }),
    );

    assert.equal(saved.fileName, "diagram.png");
    assert.equal(saved.markdownPath, "./diagram.png");

    const written = await fs.readFile(
      path.join(tempDir, "data", "repo", "content", "posts", "first-post", "diagram.png"),
    );
    assert.equal(written.byteLength, 3);
  } finally {
    process.chdir(previousCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test("savePostAsset rejects uploads to a missing post", async () => {
  const previousCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-admin-posts-"));

  try {
    process.chdir(tempDir);
    await writeTestConfig(tempDir);
    await fs.mkdir(path.join(tempDir, "data", "repo", ".git"), { recursive: true });

    await assert.rejects(
      () => savePostAsset("missing-post", new File([new Uint8Array([1])], "pic.png", { type: "image/png" })),
      NotFoundError,
    );
  } finally {
    process.chdir(previousCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});

test("updatePost rejects stale revisions", async () => {
  const previousCwd = process.cwd();
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "writer-admin-posts-"));

  try {
    process.chdir(tempDir);
    await writeTestConfig(tempDir);
    await fs.mkdir(path.join(tempDir, "data", "repo", ".git"), { recursive: true });
    await writePost(tempDir, "first-post", "First Post", "Body");

    const original = await getPost("first-post");
    const updated = await updatePost("first-post", {
      title: "First Post",
      slug: "first-post",
      date: original.date,
      draft: original.draft,
      tags: original.tags,
      categories: original.categories,
      body: "Updated body",
      revision: original.revision,
    });

    assert.notEqual(updated.revision, original.revision);

    await assert.rejects(
      () =>
        updatePost("first-post", {
          title: "First Post",
          slug: "first-post",
          date: original.date,
          draft: original.draft,
          tags: original.tags,
          categories: original.categories,
          body: "Stale body",
          revision: original.revision,
        }),
      ConflictError,
    );
  } finally {
    process.chdir(previousCwd);
    await fs.rm(tempDir, { force: true, recursive: true });
  }
});
