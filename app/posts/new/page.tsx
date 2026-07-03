import Link from "next/link";

import { LogoutButton } from "@/components/LogoutButton";
import { PostEditor } from "@/components/PostEditor";
import { requirePageSession } from "@/lib/auth";

export default async function NewPostPage() {
  await requirePageSession();

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">Writer Admin</p>
          <h1>新建文章</h1>
          <p>第一步先保存草稿，之后才能上传图片资源。</p>
        </div>

        <div className="topbar-actions">
          <Link className="secondary-button" href="/posts">
            返回列表
          </Link>
          <LogoutButton />
        </div>
      </header>

      <PostEditor mode="create" />
    </main>
  );
}
