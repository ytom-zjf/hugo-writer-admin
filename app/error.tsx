"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="zh-CN">
      <body className="error-screen">
        <main className="error-card">
          <p className="eyebrow">Writer Admin</p>
          <h1>应用出现错误</h1>
          <p>{error.message || "未知错误"}</p>
          <button className="secondary-button" onClick={() => reset()} type="button">
            重试
          </button>
        </main>
      </body>
    </html>
  );
}
