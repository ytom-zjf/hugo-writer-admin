import fs from "node:fs/promises";
import path from "node:path";

import { getConfig } from "@/lib/config";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { type FrontmatterRecord, parsePostFile, serializePostFile } from "@/lib/frontmatter";
import { ensureRepoReady } from "@/lib/repo";
import { normalizeAssetFileName, normalizePostInput, normalizeSlug, type PostInput } from "@/lib/validation";

export type PostSummary = {
  slug: string;
  title: string;
  date: string;
  draft: boolean;
  tags: string[];
  categories: string[];
  updatedAt: string;
};

export type PostRecord = PostSummary & {
  body: string;
  assets: string[];
};

type StoredPost = {
  frontmatter: FrontmatterRecord;
  body: string;
};

function getPostsRoot() {
  return path.join(getConfig().repoDir, "content", "posts");
}

function getPostDir(slug: string) {
  return path.join(getPostsRoot(), normalizeSlug(slug));
}

function getPostFilePath(slug: string) {
  return path.join(getPostDir(slug), "index.md");
}

function toStringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

async function fileExists(targetPath: string) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function readStoredPost(slug: string): Promise<StoredPost> {
  const filePath = getPostFilePath(slug);

  if (!(await fileExists(filePath))) {
    throw new NotFoundError(`Post "${slug}" does not exist`);
  }

  const source = await fs.readFile(filePath, "utf8");
  return parsePostFile(source);
}

function buildSummary(slug: string, frontmatter: FrontmatterRecord, updatedAt: Date): PostSummary {
  return {
    slug,
    title: typeof frontmatter.title === "string" ? frontmatter.title : slug,
    date: typeof frontmatter.date === "string" ? frontmatter.date : "",
    draft: typeof frontmatter.draft === "boolean" ? frontmatter.draft : true,
    tags: toStringArray(frontmatter.tags),
    categories: toStringArray(frontmatter.categories),
    updatedAt: updatedAt.toISOString(),
  };
}

function buildFrontmatter(input: Required<PostInput>, existing?: FrontmatterRecord) {
  const extras = Object.fromEntries(
    Object.entries(existing ?? {}).filter(
      ([key]) => !["date", "draft", "title", "slug", "tags", "categories"].includes(key),
    ),
  );

  return {
    date: input.date,
    draft: input.draft,
    title: input.title,
    slug: input.slug,
    tags: input.tags,
    categories: input.categories,
    ...extras,
  } satisfies FrontmatterRecord;
}

async function listAssetFilesInDirectory(postDir: string) {
  const entries = await fs.readdir(postDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name !== "index.md")
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

export async function listPosts() {
  await ensureRepoReady();

  const root = getPostsRoot();
  const entries = await fs.readdir(root, { withFileTypes: true });
  const posts: PostSummary[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const slug = entry.name;
    const postFilePath = getPostFilePath(slug);

    if (!(await fileExists(postFilePath))) {
      continue;
    }

    const rawContent = await fs.readFile(postFilePath, "utf8");
    const parsed = parsePostFile(rawContent);
    const stats = await fs.stat(postFilePath);

    posts.push(buildSummary(slug, parsed.frontmatter, stats.mtime));
  }

  return posts.sort((left, right) => right.date.localeCompare(left.date));
}

export async function getPost(slug: string): Promise<PostRecord> {
  await ensureRepoReady();

  const normalizedSlug = normalizeSlug(slug);
  const stored = await readStoredPost(normalizedSlug);
  const stats = await fs.stat(getPostFilePath(normalizedSlug));
  const assets = await listAssetFilesInDirectory(getPostDir(normalizedSlug));
  const summary = buildSummary(normalizedSlug, stored.frontmatter, stats.mtime);

  return {
    ...summary,
    body: stored.body,
    assets,
  };
}

export async function createPost(input: unknown) {
  await ensureRepoReady();

  const normalized = normalizePostInput(input, getConfig().siteTimezoneOffset);
  const postDir = getPostDir(normalized.slug);
  const postFilePath = getPostFilePath(normalized.slug);

  if (await fileExists(postDir)) {
    throw new ConflictError(`Post "${normalized.slug}" already exists`);
  }

  await fs.mkdir(postDir, { recursive: true });

  const frontmatter = buildFrontmatter(normalized);
  await fs.writeFile(postFilePath, serializePostFile(frontmatter, normalized.body), "utf8");

  return getPost(normalized.slug);
}

export async function updatePost(slug: string, input: unknown) {
  await ensureRepoReady();

  const normalizedSlug = normalizeSlug(slug);
  const normalized = normalizePostInput(input, getConfig().siteTimezoneOffset);

  if (normalized.slug !== normalizedSlug) {
    throw new ValidationError("Changing an existing slug is not supported");
  }

  const existing = await readStoredPost(normalizedSlug);
  const frontmatter = buildFrontmatter(normalized, existing.frontmatter);
  await fs.writeFile(getPostFilePath(normalizedSlug), serializePostFile(frontmatter, normalized.body), "utf8");

  return getPost(normalizedSlug);
}

export async function deletePost(slug: string) {
  await ensureRepoReady();

  const normalizedSlug = normalizeSlug(slug);
  const postDir = getPostDir(normalizedSlug);

  if (!(await fileExists(postDir))) {
    throw new NotFoundError(`Post "${normalizedSlug}" does not exist`);
  }

  await fs.rm(postDir, { recursive: true, force: true });
}

export async function savePostAsset(slug: string, file: File) {
  await ensureRepoReady();

  const normalizedSlug = normalizeSlug(slug);
  const postDir = getPostDir(normalizedSlug);
  const postFilePath = getPostFilePath(normalizedSlug);

  if (!(await fileExists(postFilePath))) {
    throw new NotFoundError(`Post "${normalizedSlug}" does not exist`);
  }

  const sourceName = normalizeAssetFileName(file.name);
  const extension = path.extname(sourceName);
  const baseName = sourceName.slice(0, sourceName.length - extension.length) || "asset";

  let candidateName = sourceName;
  let index = 1;

  while (await fileExists(path.join(postDir, candidateName))) {
    candidateName = `${baseName}-${index}${extension}`;
    index += 1;
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(path.join(postDir, candidateName), buffer);

  return {
    fileName: candidateName,
    markdownPath: `./${candidateName}`,
  };
}

export async function readPostAsset(slug: string, assetPathSegments: string[]) {
  await ensureRepoReady();

  const normalizedSlug = normalizeSlug(slug);

  if (assetPathSegments.length === 0) {
    throw new NotFoundError("Asset path is required");
  }

  const sanitizedSegments = assetPathSegments.map((segment) => normalizeAssetFileName(segment));
  const absolutePath = path.join(getPostDir(normalizedSlug), ...sanitizedSegments);
  const relative = path.relative(getPostDir(normalizedSlug), absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ValidationError("Invalid asset path");
  }

  if (!(await fileExists(absolutePath))) {
    throw new NotFoundError("Asset does not exist");
  }

  return fs.readFile(absolutePath);
}
