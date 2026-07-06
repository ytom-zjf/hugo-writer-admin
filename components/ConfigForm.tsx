"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState, useTransition } from "react";

import type { PublicRuntimeConfig } from "@/lib/config";

type ConfigFormProps = {
  initialConfig: PublicRuntimeConfig;
};

type ConfigResponse = {
  config: PublicRuntimeConfig;
};

export function ConfigForm({ initialConfig }: ConfigFormProps) {
  const router = useRouter();
  const [config, setConfig] = useState(initialConfig);
  const [adminPassword, setAdminPassword] = useState("");
  const [dataDir, setDataDir] = useState(initialConfig.dataDir);
  const [repoUrl, setRepoUrl] = useState(initialConfig.repoUrl);
  const [repoBranch, setRepoBranch] = useState(initialConfig.repoBranch);
  const [gitAuthorName, setGitAuthorName] = useState(initialConfig.gitAuthorName);
  const [gitAuthorEmail, setGitAuthorEmail] = useState(initialConfig.gitAuthorEmail);
  const [githubToken, setGithubToken] = useState("");
  const [socksProxy, setSocksProxy] = useState(initialConfig.socksProxy);
  const [sessionTtlHours, setSessionTtlHours] = useState(String(initialConfig.sessionTtlHours));
  const [siteTimezoneOffset, setSiteTimezoneOffset] = useState(initialConfig.siteTimezoneOffset);
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatusMessage("");
    setErrorMessage("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/config", {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            adminPassword,
            dataDir,
            repoUrl,
            repoBranch,
            gitAuthorName,
            gitAuthorEmail,
            githubToken,
            socksProxy,
            sessionTtlHours: Number.parseInt(sessionTtlHours, 10),
            siteTimezoneOffset,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "保存配置失败");
        }

        const payload = (await response.json()) as ConfigResponse;
        setConfig(payload.config);
        setAdminPassword("");
        setGithubToken("");
        setDataDir(payload.config.dataDir);
        setRepoUrl(payload.config.repoUrl);
        setRepoBranch(payload.config.repoBranch);
        setGitAuthorName(payload.config.gitAuthorName);
        setGitAuthorEmail(payload.config.gitAuthorEmail);
        setSocksProxy(payload.config.socksProxy);
        setSessionTtlHours(String(payload.config.sessionTtlHours));
        setSiteTimezoneOffset(payload.config.siteTimezoneOffset);
        setStatusMessage("配置已保存");
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "保存配置失败");
      }
    });
  }

  return (
    <div className="config-layout">
      <form className="editor-panel" onSubmit={handleSubmit}>
        <div className="action-row">
          <button className="primary-button" disabled={isPending} type="submit">
            {isPending ? "保存中..." : "保存配置"}
          </button>
        </div>

        <div className="meta-grid spacer-top">
          <div className="field">
            <label htmlFor="adminPassword">管理员密码</label>
            <input
              autoComplete="new-password"
              id="adminPassword"
              onChange={(event) => setAdminPassword(event.target.value)}
              placeholder={config.hasAdminPassword ? "留空则不修改" : "设置 adminPassword"}
              type="password"
              value={adminPassword}
            />
          </div>

          <div className="field">
            <label htmlFor="githubToken">GitHub Token</label>
            <input
              autoComplete="off"
              id="githubToken"
              onChange={(event) => setGithubToken(event.target.value)}
              placeholder={config.hasGithubToken ? "留空则不修改" : "设置 githubToken"}
              type="password"
              value={githubToken}
            />
          </div>

          <div className="field config-field-wide">
            <label htmlFor="dataDir">数据目录</label>
            <input
              className="mono"
              id="dataDir"
              onChange={(event) => setDataDir(event.target.value)}
              placeholder="./data"
              value={dataDir}
            />
          </div>

          <div className="field config-field-wide">
            <label htmlFor="repoUrl">仓库地址</label>
            <input
              className="mono"
              id="repoUrl"
              onChange={(event) => setRepoUrl(event.target.value)}
              placeholder="https://github.com/owner/repo.git"
              value={repoUrl}
            />
          </div>

          <div className="field config-field-wide">
            <label htmlFor="socksProxy">SOCKS5 代理</label>
            <input
              className="mono"
              id="socksProxy"
              onChange={(event) => setSocksProxy(event.target.value)}
              placeholder="socks5://127.0.0.1:1080"
              value={socksProxy}
            />
          </div>

          <div className="field">
            <label htmlFor="repoBranch">仓库分支</label>
            <input
              className="mono"
              id="repoBranch"
              onChange={(event) => setRepoBranch(event.target.value)}
              value={repoBranch}
            />
          </div>

          <div className="field">
            <label htmlFor="siteTimezoneOffset">站点时区偏移</label>
            <input
              className="mono"
              id="siteTimezoneOffset"
              onChange={(event) => setSiteTimezoneOffset(event.target.value)}
              placeholder="+08:00"
              value={siteTimezoneOffset}
            />
          </div>

          <div className="field">
            <label htmlFor="gitAuthorName">Git 提交用户名</label>
            <input id="gitAuthorName" onChange={(event) => setGitAuthorName(event.target.value)} value={gitAuthorName} />
          </div>

          <div className="field">
            <label htmlFor="gitAuthorEmail">Git 提交邮箱</label>
            <input
              className="mono"
              id="gitAuthorEmail"
              onChange={(event) => setGitAuthorEmail(event.target.value)}
              type="email"
              value={gitAuthorEmail}
            />
          </div>

          <div className="field">
            <label htmlFor="sessionTtlHours">登录有效期（小时）</label>
            <input
              id="sessionTtlHours"
              max={8760}
              min={1}
              onChange={(event) => setSessionTtlHours(event.target.value)}
              type="number"
              value={sessionTtlHours}
            />
          </div>
        </div>

        <div className="spacer-top">
          {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
          {errorMessage ? <p className="status-text error-text">{errorMessage}</p> : null}
          <p className="helper-text">保存后会立即影响新的仓库操作和后续登录；当前已登录 session 不会被主动踢出。</p>
        </div>
      </form>
    </div>
  );
}
