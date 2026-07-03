import Link from "next/link";
import { notFound } from "next/navigation";

import { LogoutButton } from "@/components/LogoutButton";
import { PostEditor } from "@/components/PostEditor";
import { NotFoundError } from "@/lib/errors";
import { requirePageSession } from "@/lib/auth";
import { getPost } from "@/lib/posts";

type PageProps = {
  params: Promise<{
    slug: string;
  }>;
};

export default async function PostDetailPage({ params }: PageProps) {
  await requirePageSession();

  const { slug } = await params;

  try {
    const post = await getPost(slug);

    return (
      <main className="page-shell">
        <header className="topbar">
          <div className="brand-block">
            <p className="eyebrow">Writer Admin</p>
            <h1>{post.title}</h1>
            <p>编辑正文、上传图片，然后直接发布到远端仓库。</p>
          </div>

          <div className="topbar-actions">
            <Link className="secondary-button" href="/posts">
              返回列表
            </Link>
            <LogoutButton />
          </div>
        </header>

        <PostEditor mode="edit" post={post} />
      </main>
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      notFound();
    }

    throw error;
  }
}
