"use client";
import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { pendingHarumadiInvite } from "@/lib/harumadiInviteIntent";
export function HarumadiInviteContinuation() {
  const pathname = usePathname(), router = useRouter();
  useEffect(() => {
    if (pathname !== "/" && pathname !== "/entry") return;
    let active = true;
    void pendingHarumadiInvite(true).then(token => { if (active && token) router.replace("/harumadi/invite"); });
    return () => { active = false; };
  }, [pathname, router]);
  return null;
}
