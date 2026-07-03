import { redirect } from "next/navigation";

import { LoginForm } from "@/components/LoginForm";
import { getSession } from "@/lib/auth";

export default async function LoginPage() {
  const session = await getSession();

  if (session) {
    redirect("/posts");
  }

  return (
    <main className="login-screen">
      <section className="login-card">
        <p className="eyebrow">Writer Admin</p>
        <h1>登录写作后台</h1>
        <p className="page-subtitle">单用户后台，保存草稿、上传图片并直接推送到 GitHub。</p>
        <LoginForm />
      </section>
    </main>
  );
}
