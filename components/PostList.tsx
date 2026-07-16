"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import type { PostSummary } from "@/lib/posts";

type PostListProps = {
  posts: PostSummary[];
};

type StatusFilter = "all" | "draft" | "published";

export function PostList({ posts }: PostListProps) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [activeTag, setActiveTag] = useState("");

  const allTags = useMemo(() => {
    const tags = new Set<string>();

    for (const post of posts) {
      for (const tag of post.tags) {
        tags.add(tag);
      }

      for (const category of post.categories) {
        tags.add(category);
      }
    }

    return Array.from(tags).sort((left, right) => left.localeCompare(right));
  }, [posts]);

  const filteredPosts = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return posts.filter((post) => {
      if (status === "draft" && !post.draft) {
        return false;
      }

      if (status === "published" && post.draft) {
        return false;
      }

      if (activeTag && !post.tags.includes(activeTag) && !post.categories.includes(activeTag)) {
        return false;
      }

      if (normalizedQuery) {
        const haystack = [post.title, post.slug, ...post.tags, ...post.categories].join(" ").toLowerCase();

        if (!haystack.includes(normalizedQuery)) {
          return false;
        }
      }

      return true;
    });
  }, [posts, query, status, activeTag]);

  return (
    <section className="post-list">
      <div className="post-filters">
        <input
          aria-label="搜索文章"
          className="post-search"
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜索标题、slug、标签…"
          type="search"
          value={query}
        />

        <div className="filter-group" role="group" aria-label="按状态筛选">
          {(
            [
              ["all", "全部"],
              ["draft", "草稿"],
              ["published", "已发布"],
            ] as [StatusFilter, string][]
          ).map(([value, label]) => (
            <button
              className={`chip-button ${status === value ? "chip-active" : ""}`}
              key={value}
              onClick={() => setStatus(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        {allTags.length > 0 ? (
          <select
            aria-label="按标签或分类筛选"
            className="tag-select"
            onChange={(event) => setActiveTag(event.target.value)}
            value={activeTag}
          >
            <option value="">全部标签 / 分类</option>
            {allTags.map((tag) => (
              <option key={tag} value={tag}>
                {tag}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <p className="helper-text post-filter-count">
        共 {posts.length} 篇，显示 {filteredPosts.length} 篇
      </p>

      {filteredPosts.length === 0 ? (
        <div className="empty-state">
          <h2>没有匹配的文章</h2>
          <p className="page-subtitle">试试调整搜索关键词或筛选条件。</p>
        </div>
      ) : (
        <div className="post-table">
          <table>
            <thead>
              <tr>
                <th>标题</th>
                <th>状态</th>
                <th>标签 / 分类</th>
                <th>日期</th>
                <th>更新于</th>
              </tr>
            </thead>
            <tbody>
              {filteredPosts.map((post) => (
                <tr key={post.slug}>
                  <td>
                    <Link className="two-line" href={`/posts/${post.slug}`}>
                      <strong>{post.title}</strong>
                      <span className="mono helper-text">{post.slug}</span>
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${post.draft ? "badge-draft" : ""}`}>{post.draft ? "草稿" : "已发布"}</span>
                  </td>
                  <td>
                    <div className="badge-row">
                      {post.tags.map((tag) => (
                        <span className="badge" key={`tag-${post.slug}-${tag}`}>
                          #{tag}
                        </span>
                      ))}
                      {post.categories.map((category) => (
                        <span className="badge" key={`category-${post.slug}-${category}`}>
                          {category}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="mono">{post.date || "-"}</td>
                  <td className="mono">{post.updatedAt.replace("T", " ").slice(0, 16)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
