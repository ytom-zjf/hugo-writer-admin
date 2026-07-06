"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

type SyncResponse = {
  result: {
    cloned: boolean;
    pulled: boolean;
    skipped: boolean;
    reason?: "localChanges";
  };
};

function buildMessage(result: SyncResponse["result"]) {
  if (result.cloned) {
    return "已克隆远端仓库";
  }

  if (result.skipped && result.reason === "localChanges") {
    return "本地有未发布更改，已跳过同步";
  }

  if (result.pulled) {
    return "已同步远端更新";
  }

  return "仓库已是最新状态";
}

export function SyncRepoButton() {
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSync() {
    setMessage("");
    setError("");

    startTransition(async () => {
      try {
        const response = await fetch("/api/repo/sync", {
          method: "POST",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "同步失败");
        }

        const payload = (await response.json()) as SyncResponse;
        setMessage(buildMessage(payload.result));
        router.refresh();
      } catch (syncError) {
        setError(syncError instanceof Error ? syncError.message : "同步失败");
      }
    });
  }

  return (
    <div className="inline-status">
      <button className="secondary-button" disabled={isPending} onClick={handleSync} type="button">
        {isPending ? "同步中..." : "同步仓库"}
      </button>
      {message ? <span className="status-text">{message}</span> : null}
      {error ? <span className="status-text error-text">{error}</span> : null}
    </div>
  );
}
