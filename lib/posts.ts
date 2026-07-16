import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import type { Dirent } from "node:fs";

import { getConfig } from "@/lib/config";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";
import { type FrontmatterRecord, parsePostFile, serializePostFile } from "@/lib/frontmatter";
import { ensureRepoReady, withRepoWorkingTree } from "@/lib/repo";
import { normalizeAssetFileName, normalizePostInput, normalizeSlug, type PostInput } from "@/lib/validation";

const MAX_ASSET_BYTES = 20 * 1024 * 1024;
const ALLOWED_ASSET_EXTENSIONS = new Set([
  ".png",
  ".jpg",
  ".jpeg",
  ".gif",
  ".webp",
  ".avif",
  ".svg",
]);

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
  revision: string;
};

type StoredPost = {
  frontmatter: FrontmatterRecord;
  body: string;
  revision: string;
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
  return {
    ...parsePostFile(source),
    revision: buildPostRevision(source),
  };
}

function buildPostRevision(source: string) {
  return createHash("sha256").update(source).digest("hex");
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

function isNotFoundError(error: unknown) {
  return !!error && typeof error === "object" && "code" in error && error.code === "ENOENT";
}

async function readPostSummaryFromDirectory(entry: Dirent) {
  if (!entry.isDirectory()) {
    return null;
  }

  const slug = entry.name;
  const postFilePath = getPostFilePath(slug);

  try {
    const [rawContent, stats] = await Promise.all([fs.readFile(postFilePath, "utf8"), fs.stat(postFilePath)]);
    const parsed = parsePostFile(rawContent);
    return buildSummary(slug, parsed.frontmatter, stats.mtime);
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

export async function listPosts() {
  await ensureRepoReady();

  const root = getPostsRoot();

  let entries: Dirent[];

  try {
    entries = await fs.readdir(root, { withFileTypes: true });
  } catch (error) {
    if (isNotFoundError(error)) {
      return [];
    }

    throw error;
  }

  const posts = await Promise.all(entries.map((entry) => readPostSummaryFromDirectory(entry)));
  return posts.filter((post): post is PostSummary => !!post).sort((left, right) => right.date.localeCompare(left.date));
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
    revision: stored.revision,
  };
}

export async function createPost(input: unknown) {
  const normalized = normalizePostInput(input, getConfig().siteTimezoneOffset);
  const postDir = getPostDir(normalized.slug);
  const postFilePath = getPostFilePath(normalized.slug);

  await withRepoWorkingTree(async () => {
    if (await fileExists(postDir)) {
      throw new ConflictError(`Post "${normalized.slug}" already exists`);
    }

    await fs.mkdir(postDir, { recursive: true });

    const frontmatter = buildFrontmatter(normalized);
    await fs.writeFile(postFilePath, serializePostFile(frontmatter, normalized.body), "utf8");
  });

  return getPost(normalized.slug);
}

export async function updatePost(slug: string, input: unknown) {
  const normalizedSlug = normalizeSlug(slug);
  const normalized = normalizePostInput(input, getConfig().siteTimezoneOffset);
  const expectedRevision =
    input && typeof input === "object" && "revision" in input && typeof input.revision === "string"
      ? input.revision.trim()
      : "";

  if (normalized.slug !== normalizedSlug) {
    throw new ValidationError("Changing an existing slug is not supported");
  }

  await withRepoWorkingTree(async () => {
    const existing = await readStoredPost(normalizedSlug);

    if (expectedRevision && expectedRevision !== existing.revision) {
      throw new ConflictError("文章已被其他操作修改，请刷新后再保存");
    }

    const frontmatter = buildFrontmatter(normalized, existing.frontmatter);
    await fs.writeFile(getPostFilePath(normalizedSlug), serializePostFile(frontmatter, normalized.body), "utf8");
  });

  return getPost(normalizedSlug);
}

export async function deletePost(slug: string) {
  const normalizedSlug = normalizeSlug(slug);
  const postDir = getPostDir(normalizedSlug);

  await withRepoWorkingTree(async () => {
    if (!(await fileExists(postDir))) {
      throw new NotFoundError(`Post "${normalizedSlug}" does not exist`);
    }

    await fs.rm(postDir, { recursive: true, force: true });
  });
}

export async function savePostAsset(slug: string, file: File) {
  const normalizedSlug = normalizeSlug(slug);
  const postDir = getPostDir(normalizedSlug);
  const postFilePath = getPostFilePath(normalizedSlug);

  const sourceName = normalizeAssetFileName(file.name);
  const extension = path.extname(sourceName);

  if (!ALLOWED_ASSET_EXTENSIONS.has(extension.toLowerCase())) {
    throw new ValidationError("仅支持上传图片文件（png、jpg、gif、webp、avif、svg）");
  }

  if (file.size > MAX_ASSET_BYTES) {
    throw new ValidationError(`图片大小不能超过 ${MAX_ASSET_BYTES / (1024 * 1024)}MB`);
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const baseName = sourceName.slice(0, sourceName.length - extension.length) || "asset";

  return withRepoWorkingTree(async () => {
    if (!(await fileExists(postFilePath))) {
      throw new NotFoundError(`Post "${normalizedSlug}" does not exist`);
    }

    let candidateName = sourceName;
    let index = 1;

    while (await fileExists(path.join(postDir, candidateName))) {
      candidateName = `${baseName}-${index}${extension}`;
      index += 1;
    }

    await fs.writeFile(path.join(postDir, candidateName), buffer);

    return {
      fileName: candidateName,
      markdownPath: `./${candidateName}`,
    };
  });
}

export async function deletePostAsset(slug: string, fileName: string) {
  const normalizedSlug = normalizeSlug(slug);
  const postDir = getPostDir(normalizedSlug);
  const sanitizedName = normalizeAssetFileName(fileName);

  if (sanitizedName === "index.md") {
    throw new ValidationError("Cannot delete the post file");
  }

  const absolutePath = path.join(postDir, sanitizedName);
  const relative = path.relative(postDir, absolutePath);

  if (relative.startsWith("..") || path.isAbsolute(relative) || relative !== sanitizedName) {
    throw new ValidationError("Invalid asset path");
  }

  await withRepoWorkingTree(async () => {
    if (!(await fileExists(absolutePath))) {
      throw new NotFoundError("Asset does not exist");
    }

    await fs.rm(absolutePath);
  });

  return { fileName: sanitizedName };
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
