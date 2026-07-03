import test from "node:test";
import assert from "node:assert/strict";

import { parsePostFile, serializePostFile } from "../lib/frontmatter";

test("parsePostFile reads TOML front matter and markdown body", () => {
  const source = `+++
date = '2026-07-03T10:00:00+08:00'
draft = true
title = '测试文章'
slug = 'test-post'
tags = ['Hugo']
categories = ['技术']
summary = 'extra'
+++

正文第一段
`;

  const parsed = parsePostFile(source);

  assert.equal(parsed.frontmatter.slug, "test-post");
  assert.equal(parsed.frontmatter.summary, "extra");
  assert.equal(parsed.body, "正文第一段\n");
});

test("serializePostFile keeps known keys first and preserves extra keys", () => {
  const serialized = serializePostFile(
    {
      title: "标题",
      slug: "example-post",
      date: "2026-07-03T10:00:00+08:00",
      draft: false,
      tags: ["Hugo", "部署"],
      categories: ["技术"],
      summary: "extra",
    },
    "正文内容",
  );

  assert.match(
    serialized,
    /^\+\+\+\ndate = "2026-07-03T10:00:00\+08:00"\ndraft = false\ntitle = "标题"\nslug = "example-post"\ntags = \[ "Hugo", "部署" \]\ncategories = \[ "技术" \]\nsummary = "extra"\n\+\+\+/,
  );
  assert.match(serialized, /\n\n正文内容\n$/);
});
