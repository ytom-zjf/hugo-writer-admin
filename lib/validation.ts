import { ValidationError } from "@/lib/errors";

export type PostInput = {
  title: string;
  slug: string;
  date?: string;
  draft?: boolean;
  tags?: string[];
  categories?: string[];
  body?: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const OFFSET_PATTERN = /^([+-])(\d{2}):(\d{2})$/;

function cleanStringArray(values: unknown, fieldName: string) {
  if (!Array.isArray(values)) {
    throw new ValidationError(`${fieldName} must be an array of strings`);
  }

  return values
    .map((item) => {
      if (typeof item !== "string") {
        throw new ValidationError(`${fieldName} must contain only strings`);
      }

      return item.trim();
    })
    .filter(Boolean);
}

export function formatDateWithOffset(date: Date, offset: string) {
  const match = OFFSET_PATTERN.exec(offset);

  if (!match) {
    throw new ValidationError("SITE_TIMEZONE_OFFSET must look like +08:00");
  }

  const [, sign, hourText, minuteText] = match;
  const direction = sign === "+" ? 1 : -1;
  const totalMinutes = direction * (Number.parseInt(hourText, 10) * 60 + Number.parseInt(minuteText, 10));
  const shiftedDate = new Date(date.getTime() + totalMinutes * 60 * 1000);

  const iso = shiftedDate.toISOString().slice(0, 19);
  return `${iso}${offset}`;
}

export function normalizePostInput(input: unknown, timezoneOffset: string): Required<PostInput> {
  if (!input || typeof input !== "object") {
    throw new ValidationError("Request body must be a JSON object");
  }

  const {
    title,
    slug,
    date,
    draft,
    tags = [],
    categories = [],
    body = "",
  } = input as Record<string, unknown>;

  if (typeof title !== "string" || title.trim().length === 0) {
    throw new ValidationError("title is required");
  }

  if (typeof slug !== "string" || slug.trim().length === 0) {
    throw new ValidationError("slug is required");
  }

  const normalizedSlug = slug.trim().toLowerCase();

  if (!SLUG_PATTERN.test(normalizedSlug)) {
    throw new ValidationError("slug must use lowercase letters, numbers, and hyphens");
  }

  if (typeof body !== "string") {
    throw new ValidationError("body must be a string");
  }

  const normalizedDate =
    typeof date === "string" && date.trim().length > 0 ? date.trim() : formatDateWithOffset(new Date(), timezoneOffset);

  if (Number.isNaN(Date.parse(normalizedDate))) {
    throw new ValidationError("date must be a valid ISO-8601 string");
  }

  if (draft !== undefined && typeof draft !== "boolean") {
    throw new ValidationError("draft must be true or false");
  }

  return {
    title: title.trim(),
    slug: normalizedSlug,
    date: normalizedDate,
    draft: draft ?? true,
    tags: cleanStringArray(tags, "tags"),
    categories: cleanStringArray(categories, "categories"),
    body,
  };
}

export function normalizeSlug(input: string) {
  const value = input.trim().toLowerCase();

  if (!SLUG_PATTERN.test(value)) {
    throw new ValidationError("Invalid slug");
  }

  return value;
}

export function normalizeAssetFileName(fileName: string) {
  const cleaned = fileName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleaned) {
    throw new ValidationError("Invalid asset file name");
  }

  return cleaned;
}
