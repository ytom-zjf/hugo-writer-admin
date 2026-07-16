"use client";

import { useRouter } from "next/navigation";
import {
  ChangeEvent,
  ClipboardEvent,
  DragEvent,
  useDeferredValue,
  useEffect,
  useRef,
  useState,
  useTransition,
} from "react";

import type { PostRecord } from "@/lib/posts";

type PostEditorProps = {
  mode: "create" | "edit";
  post?: PostRecord;
};

type SaveResponse = {
  post: PostRecord;
};

type RemoteStatus = {
  cloned: boolean;
  ahead: number;
  behind: number;
  hasLocalChanges: boolean;
};

type RemoteStatusResponse = {
  result: RemoteStatus;
};

function joinValues(value: string[]) {
  return value.join(", ");
}

function splitValues(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildRemoteBehindMessage(status: RemoteStatus) {
  const commitText = `${status.behind} 个新提交`;

  if (status.hasLocalChanges) {
    return `远端仓库已有 ${commitText}，本地也有未发布更改；请先处理本地更改并同步后再发布。`;
  }

  return `远端仓库已有 ${commitText}，请先返回列表同步仓库后再继续发布。`;
}

function buildPreviewDocument(html: string, slug: string) {
  const baseHref = slug ? `/api/posts/${slug}/assets/` : "/";

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <base href="${baseHref}" />
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: "Source Han Sans SC", "Noto Sans SC", sans-serif;
        color: #1d1c1b;
        line-height: 1.75;
      }
      pre {
        padding: 16px;
        overflow: auto;
        background: #f5f5f1;
        border-radius: 12px;
      }
      code {
        font-family: "JetBrains Mono", "Sarasa Mono SC", monospace;
      }
      img {
        max-width: 100%;
        border-radius: 16px;
      }
      table {
        width: 100%;
        border-collapse: collapse;
      }
      th, td {
        padding: 8px 10px;
        border: 1px solid #ddd5ca;
      }
      blockquote {
        margin: 0;
        padding-left: 16px;
        border-left: 4px solid #bdd5cc;
        color: #5e5b56;
      }
      a {
        color: #155e52;
      }
    </style>
  </head>
  <body>${html}</body>
</html>`;
}

export function PostEditor({ mode, post }: PostEditorProps) {
  const router = useRouter();
  const [title, setTitle] = useState(post?.title ?? "");
  const [slug, setSlug] = useState(post?.slug ?? "");
  const [date, setDate] = useState(post?.date ?? "");
  const [draft, setDraft] = useState(post?.draft ?? true);
  const [tagsInput, setTagsInput] = useState(joinValues(post?.tags ?? []));
  const [categoriesInput, setCategoriesInput] = useState(joinValues(post?.categories ?? []));
  const [body, setBody] = useState(post?.body ?? "");
  const [revision, setRevision] = useState(post?.revision ?? "");
  const [previewHtml, setPreviewHtml] = useState("<p>开始输入内容后会显示预览。</p>");
  const [statusMessage, setStatusMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [remoteStatus, setRemoteStatus] = useState<RemoteStatus | null>(null);
  const [remoteStatusError, setRemoteStatusError] = useState("");
  const [isCheckingRemoteStatus, setIsCheckingRemoteStatus] = useState(false);
  const [assets, setAssets] = useState(post?.assets ?? []);
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const deferredBody = useDeferredValue(body);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function buildSnapshot() {
    return JSON.stringify([title, slug, date, draft, tagsInput, categoriesInput, body]);
  }

  const savedSnapshotRef = useRef(buildSnapshot());
  const isDirty = savedSnapshotRef.current !== buildSnapshot();

  function markSaved() {
    savedSnapshotRef.current = buildSnapshot();
  }

  useEffect(() => {
    function handleBeforeUnload(event: BeforeUnloadEvent) {
      if (savedSnapshotRef.current !== buildSnapshot()) {
        event.preventDefault();
        event.returnValue = "";
      }
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  });

  useEffect(() => {
    // Client-side navigations (e.g. the back-to-list link) bypass beforeunload,
    // so intercept anchor clicks in the capture phase while there are unsaved edits.
    function handleClickCapture(event: MouseEvent) {
      if (savedSnapshotRef.current === buildSnapshot()) {
        return;
      }

      const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;

      if (!anchor) {
        return;
      }

      if (!window.confirm("当前有未保存的更改，确定要离开吗？")) {
        event.preventDefault();
        event.stopPropagation();
      }
    }

    document.addEventListener("click", handleClickCapture, true);
    return () => document.removeEventListener("click", handleClickCapture, true);
  });

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        handleSave();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  });

  async function fetchRemoteStatus(signal?: AbortSignal) {
    const response = await fetch("/api/repo/status", {
      cache: "no-store",
      method: "GET",
      signal,
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "远端状态检查失败");
    }

    const payload = (await response.json()) as RemoteStatusResponse;
    return payload.result;
  }

  async function refreshRemoteStatus(signal?: AbortSignal) {
    setIsCheckingRemoteStatus(true);
    setRemoteStatusError("");

    try {
      const result = await fetchRemoteStatus(signal);
      setRemoteStatus(result);
      return { result, error: "" };
    } catch (error) {
      if (signal?.aborted) {
        return { result: null, error: "" };
      }

      const message = error instanceof Error ? error.message : "远端状态检查失败";
      setRemoteStatusError(message);
      return { result: null, error: message };
    } finally {
      if (!signal?.aborted) {
        setIsCheckingRemoteStatus(false);
      }
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    void refreshRemoteStatus(controller.signal);

    return () => {
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await fetch("/api/preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ markdown: deferredBody }),
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const payload = (await response.json()) as { html: string };
        setPreviewHtml(payload.html || "<p></p>");
      } catch {
        // Ignore aborted or transient preview requests.
      }
    }, 250);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [deferredBody]);

  async function saveCurrentPost(currentMode: "create" | "edit") {
    const endpoint = currentMode === "create" ? "/api/posts" : `/api/posts/${post!.slug}`;
    const method = currentMode === "create" ? "POST" : "PUT";

    const response = await fetch(endpoint, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        slug,
        date,
        draft,
        tags: splitValues(tagsInput),
        categories: splitValues(categoriesInput),
        body,
        revision: currentMode === "edit" ? revision : undefined,
      }),
    });

    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(payload?.error || "保存失败");
    }

    return (await response.json()) as SaveResponse;
  }

  function handleSave() {
    setErrorMessage("");
    setStatusMessage("");

    startTransition(async () => {
      try {
        const result = await saveCurrentPost(mode);
        markSaved();
        setStatusMessage("草稿已保存");

        if (mode === "create") {
          router.replace(`/posts/${result.post.slug}`);
          router.refresh();
          return;
        }

        setAssets(result.post.assets);
        setRevision(result.post.revision);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "保存失败");
      }
    });
  }

  function handlePublish() {
    setErrorMessage("");
    setStatusMessage("");

    startTransition(async () => {
      try {
        const { result: currentRemoteStatus, error: remoteCheckError } = await refreshRemoteStatus();

        if (currentRemoteStatus?.behind) {
          setErrorMessage(buildRemoteBehindMessage(currentRemoteStatus));
          return;
        }

        if (!currentRemoteStatus) {
          setErrorMessage(remoteCheckError || "远端状态检查失败");
          return;
        }

        const result = await saveCurrentPost(mode);

        const publishResponse = await fetch(`/api/posts/${result.post.slug}/publish`, {
          method: "POST",
        });

        if (!publishResponse.ok) {
          const payload = (await publishResponse.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "发布失败");
        }

        setStatusMessage("已提交并推送到 GitHub");
        markSaved();
        setRevision(result.post.revision);
        router.replace(`/posts/${result.post.slug}`);
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "发布失败");
      }
    });
  }

  function handleDelete() {
    if (!post) {
      return;
    }

    const confirmed = window.confirm(`确认删除文章 "${post.title}" 吗？此操作会直接推送到远端仓库。`);

    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    setStatusMessage("");

    startTransition(async () => {
      try {
        const response = await fetch(`/api/posts/${post.slug}`, {
          method: "DELETE",
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "删除失败");
        }

        router.replace("/posts");
        router.refresh();
      } catch (error) {
        setErrorMessage(error instanceof Error ? error.message : "删除失败");
      }
    });
  }

  function insertIntoBody(snippet: string) {
    const textarea = bodyRef.current;

    if (!textarea) {
      setBody((current) => `${current.trimEnd()}\n\n${snippet}\n`);
      return;
    }

    const start = textarea.selectionStart ?? textarea.value.length;
    const end = textarea.selectionEnd ?? start;
    const needsLeadingBreak = start > 0 && textarea.value[start - 1] !== "\n";
    const insertion = `${needsLeadingBreak ? "\n" : ""}${snippet}\n`;

    setBody((current) => `${current.slice(0, start)}${insertion}${current.slice(end)}`);

    requestAnimationFrame(() => {
      const cursor = start + insertion.length;
      textarea.focus();
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  async function uploadAssetFile(file: File) {
    if (mode === "create") {
      setErrorMessage("请先保存草稿，再上传图片");
      return;
    }

    setErrorMessage("");
    setStatusMessage("");
    setIsUploading(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch(`/api/posts/${post!.slug}/assets`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "上传失败");
      }

      const payload = (await response.json()) as {
        asset: {
          fileName: string;
          markdownPath: string;
        };
      };

      setAssets((current) => [...current, payload.asset.fileName]);
      insertIntoBody(`![](${payload.asset.markdownPath})`);
      setStatusMessage(`已上传 ${payload.asset.fileName}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "上传失败");
    } finally {
      setIsUploading(false);
    }
  }

  async function handleAssetUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    await uploadAssetFile(file);
  }

  function pickImageFiles(fileList: FileList | undefined | null) {
    return Array.from(fileList ?? []).filter((file) => file.type.startsWith("image/"));
  }

  function handleBodyPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const images = pickImageFiles(event.clipboardData?.files);

    if (images.length === 0) {
      return;
    }

    event.preventDefault();

    void (async () => {
      for (const image of images) {
        await uploadAssetFile(image);
      }
    })();
  }

  function handleBodyDragOver(event: DragEvent<HTMLTextAreaElement>) {
    if (Array.from(event.dataTransfer?.items ?? []).some((item) => item.kind === "file")) {
      event.preventDefault();
      setIsDragging(true);
    }
  }

  function handleBodyDragLeave() {
    setIsDragging(false);
  }

  function handleBodyDrop(event: DragEvent<HTMLTextAreaElement>) {
    setIsDragging(false);
    const images = pickImageFiles(event.dataTransfer?.files);

    if (images.length === 0) {
      return;
    }

    event.preventDefault();

    void (async () => {
      for (const image of images) {
        await uploadAssetFile(image);
      }
    })();
  }

  async function handleAssetDelete(fileName: string) {
    const referenced = body.includes(`./${fileName}`);
    const confirmed = window.confirm(
      referenced
        ? `正文中仍引用了 "${fileName}"，删除后图片会失效。确认删除吗？`
        : `确认删除图片 "${fileName}" 吗？下次发布时生效。`,
    );

    if (!confirmed) {
      return;
    }

    setErrorMessage("");
    setStatusMessage("");

    try {
      const response = await fetch(`/api/posts/${post!.slug}/assets/${encodeURIComponent(fileName)}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "删除失败");
      }

      setAssets((current) => current.filter((asset) => asset !== fileName));
      setStatusMessage(`已删除 ${fileName}`);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "删除失败");
    }
  }

  const previewDocument = buildPreviewDocument(previewHtml, post?.slug ?? slug);
  const remoteBehindMessage = remoteStatus?.behind ? buildRemoteBehindMessage(remoteStatus) : "";

  return (
    <div className="layout-grid">
      <section className="editor-column">
        <div className="editor-panel">
          {isCheckingRemoteStatus ? <p className="status-text">正在检查远端更新...</p> : null}
          {remoteBehindMessage ? <p className="status-text warning-text">{remoteBehindMessage}</p> : null}
          {remoteStatusError ? <p className="status-text error-text">远端状态检查失败：{remoteStatusError}</p> : null}

          <div className="action-row">
            <button className="primary-button" disabled={isPending} onClick={handleSave} type="button">
              {isPending ? "处理中..." : isDirty ? "保存草稿 *" : "保存草稿"}
            </button>
            <button className="secondary-button" disabled={isPending} onClick={handlePublish} type="button">
              发布到 GitHub
            </button>
            {post ? (
              <button className="danger-button" disabled={isPending} onClick={handleDelete} type="button">
                删除文章
              </button>
            ) : null}
            {isDirty ? <span className="status-text warning-text">有未保存的更改</span> : null}
          </div>

          <div className="meta-grid spacer-top">
            <div className="field">
              <label htmlFor="title">标题</label>
              <input id="title" onChange={(event) => setTitle(event.target.value)} value={title} />
            </div>

            <div className="field">
              <label htmlFor="slug">Slug</label>
              <input
                className="mono"
                disabled={mode === "edit"}
                id="slug"
                onChange={(event) => setSlug(event.target.value)}
                placeholder="url-slug"
                value={slug}
              />
            </div>

            <div className="field">
              <label htmlFor="date">日期</label>
              <input
                className="mono"
                id="date"
                onChange={(event) => setDate(event.target.value)}
                placeholder="2026-07-03T12:00:00+08:00"
                value={date}
              />
            </div>

            <div className="field field-inline">
              <input checked={draft} id="draft" onChange={(event) => setDraft(event.target.checked)} type="checkbox" />
              <label htmlFor="draft">保持为草稿</label>
            </div>

            <div className="field">
              <label htmlFor="tags">标签</label>
              <input
                id="tags"
                onChange={(event) => setTagsInput(event.target.value)}
                placeholder="Hugo, 写作, 部署"
                value={tagsInput}
              />
            </div>

            <div className="field">
              <label htmlFor="categories">分类</label>
              <input
                id="categories"
                onChange={(event) => setCategoriesInput(event.target.value)}
                placeholder="技术, 随笔"
                value={categoriesInput}
              />
            </div>
          </div>

          <div className="field spacer-top">
            <label htmlFor="body">Markdown</label>
            <textarea
              className={isDragging ? "is-dragging" : undefined}
              id="body"
              onChange={(event) => setBody(event.target.value)}
              onDragLeave={handleBodyDragLeave}
              onDragOver={handleBodyDragOver}
              onDrop={handleBodyDrop}
              onPaste={handleBodyPaste}
              ref={bodyRef}
              value={body}
            />
            <p className="helper-text">
              {mode === "create"
                ? "保存草稿后即可粘贴或拖拽图片上传。"
                : isUploading
                  ? "正在上传图片…"
                  : "支持 Ctrl/Cmd+S 保存，可直接粘贴或拖拽图片到此处上传。"}
            </p>
          </div>

          <div className="spacer-top">
            {statusMessage ? <p className="status-text">{statusMessage}</p> : null}
            {errorMessage ? <p className="status-text error-text">{errorMessage}</p> : null}
            <p className="helper-text">保存只写入仓库工作副本；发布会先检查远端更新，再 commit 并 push 到配置分支。</p>
          </div>
        </div>
      </section>

      <aside className="side-column">
        <div className="asset-panel">
          <h2>图片资源</h2>
          <p className="muted-text">图片会写入文章 bundle 目录，并自动插入相对路径。</p>
          <input
            accept="image/*"
            disabled={mode === "create" || isUploading}
            onChange={handleAssetUpload}
            type="file"
          />

          <div className="asset-list">
            {assets.length > 0 ? (
              assets.map((asset) => (
                <div className="asset-item" key={asset}>
                  <span className="mono">{asset}</span>
                  <div className="asset-item-actions">
                    <button
                      className="ghost-button"
                      onClick={() => insertIntoBody(`![](./${asset})`)}
                      type="button"
                    >
                      插入
                    </button>
                    <button className="danger-button" onClick={() => handleAssetDelete(asset)} type="button">
                      删除
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted-text">当前没有图片资源。</p>
            )}
          </div>
        </div>

        <div className="preview-panel">
          <h2>预览</h2>
          <p className="muted-text">这里是服务内 Markdown 预览，样式接近最终页面，但不等同于 Hugo 主题渲染。</p>
          <iframe
            className="preview-frame"
            sandbox="allow-same-origin"
            srcDoc={previewDocument}
            title="Markdown preview"
          />
        </div>
      </aside>
    </div>
  );
}
