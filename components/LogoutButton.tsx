"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function LogoutButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function handleLogout() {
    startTransition(async () => {
      const response = await fetch("/api/logout", {
        method: "POST",
      });

      if (response.ok) {
        router.replace("/login");
      }
    });
  }

  return (
    <button className="secondary-button" disabled={isPending} onClick={handleLogout} type="button">
      {isPending ? "退出中..." : "退出登录"}
    </button>
  );
}
