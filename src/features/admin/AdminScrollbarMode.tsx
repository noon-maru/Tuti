"use client";

import { useLayoutEffect } from "react";

export function AdminScrollbarMode() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-admin-scrollbars", "");

    return () => {
      root.removeAttribute("data-admin-scrollbars");
    };
  }, []);

  return null;
}
