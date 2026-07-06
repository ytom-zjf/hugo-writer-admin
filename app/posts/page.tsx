import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/LogoutButton";
import { SyncRepoButton } from "@/components/SyncRepoButton";
import { listPosts } from "@/lib/posts";
import { requirePageSession } from "@/lib/auth";
import { isOperationalConfigComplete } from "@/lib/config";

export default async function PostsPage() {
  await requirePageSession();

  if (!isOperationalConfigComplete()) {
    redirect("/config");
  }

  const posts = await listPosts();

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">Writer Admin</p>
          <h1>文章列表</h1>
          <p>
            管理 <code>content/posts/&lt;slug&gt;/index.md</code>，发布时直接推送到 <code>main</code>。
          </p>
        </div>

        <div className="topbar-actions">
          <SyncRepoButton />
          <Link className="secondary-button" href="/config">
            配置
          </Link>
          <Link className="primary-button" href="/posts/new">
            新建文章
          </Link>
          <LogoutButton />
        </div>
      </header>

      {posts.length === 0 ? (
        <section className="empty-state">
          <h2>还没有文章</h2>
          <p className="page-subtitle">先创建一篇草稿，保存后即可继续上传图片和发布。</p>
        </section>
      ) : (
        <section className="post-table">
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
              {posts.map((post) => (
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
        </section>
      )}
    </main>
  );
}
