import test from "node:test";
import assert from "node:assert/strict";

import { ValidationError } from "../lib/errors";
import { formatDateWithOffset, normalizeAssetFileName, normalizePostInput } from "../lib/validation";

test("formatDateWithOffset writes timestamps with the configured offset", () => {
  const formatted = formatDateWithOffset(new Date("2026-07-03T04:00:00.000Z"), "+08:00");
  assert.equal(formatted, "2026-07-03T12:00:00+08:00");
});

test("normalizePostInput fills defaults and trims arrays", () => {
  const normalized = normalizePostInput(
    {
      title: "  标题  ",
      slug: "Example-Post",
      tags: [" Hugo ", "  ", "部署"],
      categories: [" 技术 "],
      body: "正文",
    },
    "+08:00",
  );

  assert.equal(normalized.title, "标题");
  assert.equal(normalized.slug, "example-post");
  assert.equal(normalized.draft, true);
  assert.deepEqual(normalized.tags, ["Hugo", "部署"]);
  assert.deepEqual(normalized.categories, ["技术"]);
});

test("normalizeAssetFileName rejects empty names", () => {
  assert.throws(() => normalizeAssetFileName("   "), ValidationError);
});
