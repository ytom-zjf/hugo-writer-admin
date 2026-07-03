import * as TOML from "@iarna/toml";

import { ValidationError } from "@/lib/errors";

export type FrontmatterValue =
  | string
  | number
  | boolean
  | null
  | FrontmatterValue[]
  | { [key: string]: FrontmatterValue };

export type FrontmatterRecord = Record<string, FrontmatterValue>;

export type ParsedPostFile = {
  frontmatter: FrontmatterRecord;
  body: string;
};

const FRONTMATTER_BOUNDARY = "+++";

export function parsePostFile(source: string): ParsedPostFile {
  const normalized = source.replace(/\r\n/g, "\n");

  if (!normalized.startsWith(`${FRONTMATTER_BOUNDARY}\n`)) {
    throw new ValidationError("Post file must start with TOML front matter");
  }

  const closingIndex = normalized.indexOf(`\n${FRONTMATTER_BOUNDARY}\n`, FRONTMATTER_BOUNDARY.length + 1);

  if (closingIndex === -1) {
    throw new ValidationError("Post file is missing a closing TOML front matter delimiter");
  }

  const frontmatterContent = normalized.slice(FRONTMATTER_BOUNDARY.length + 1, closingIndex);
  const bodyStart = closingIndex + `\n${FRONTMATTER_BOUNDARY}\n`.length;
  const body = normalized.slice(bodyStart).replace(/^\n/, "");

  return {
    frontmatter: TOML.parse(frontmatterContent) as FrontmatterRecord,
    body,
  };
}

function sortExtraEntries(entries: [string, FrontmatterValue][]) {
  return [...entries].sort(([left], [right]) => left.localeCompare(right));
}

export function serializePostFile(frontmatter: FrontmatterRecord, body: string) {
  const {
    date,
    draft,
    title,
    slug,
    tags,
    categories,
    ...rest
  } = frontmatter;

  const orderedFrontmatter: FrontmatterRecord = {};

  if (date !== undefined) orderedFrontmatter.date = date;
  if (draft !== undefined) orderedFrontmatter.draft = draft;
  if (title !== undefined) orderedFrontmatter.title = title;
  if (slug !== undefined) orderedFrontmatter.slug = slug;
  if (tags !== undefined) orderedFrontmatter.tags = tags;
  if (categories !== undefined) orderedFrontmatter.categories = categories;

  for (const [key, value] of sortExtraEntries(Object.entries(rest))) {
    orderedFrontmatter[key] = value;
  }

  const serializedFrontmatter = TOML.stringify(orderedFrontmatter as TOML.JsonMap).trimEnd();
  const normalizedBody = body.replace(/\r\n/g, "\n").trim();

  return `+++\n${serializedFrontmatter}\n+++\n\n${normalizedBody}\n`;
}
