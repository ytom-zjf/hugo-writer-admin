import Link from "next/link";
import { redirect } from "next/navigation";

import { LogoutButton } from "@/components/LogoutButton";
import { PostList } from "@/components/PostList";
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
        <PostList posts={posts} />
      )}
    </main>
  );
}
