"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchServiceTerms } from "@/lib/serviceTerms";

export function PublishedServiceTermsLink() {
  const [published, setPublished] = useState(false);
  useEffect(() => {
    let disposed = false;
    void fetchServiceTerms(false).then((status) => {
      if (!disposed) setPublished(Boolean(status.current || status.upcoming));
    }).catch(() => {});
    return () => { disposed = true; };
  }, []);
  return published ? <Link href="/legal/service-terms">서비스 이용약관</Link> : null;
}
