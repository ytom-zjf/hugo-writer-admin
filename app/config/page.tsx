import Link from "next/link";

import { ConfigForm } from "@/components/ConfigForm";
import { LogoutButton } from "@/components/LogoutButton";
import { requirePageSession } from "@/lib/auth";
import { getPublicConfig } from "@/lib/config";

export default async function ConfigPage() {
  await requirePageSession();

  const config = getPublicConfig();

  return (
    <main className="page-shell">
      <header className="topbar">
        <div className="brand-block">
          <p className="eyebrow">Writer Admin</p>
          <h1>配置管理</h1>
          <p>修改仓库、发布身份、登录有效期和敏感凭据。</p>
        </div>

        <div className="topbar-actions">
          <Link className="secondary-button" href="/posts">
            返回列表
          </Link>
          <LogoutButton />
        </div>
      </header>

      <ConfigForm initialConfig={config} />
    </main>
  );
}
