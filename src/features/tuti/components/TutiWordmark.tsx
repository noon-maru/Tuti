"use client";

import Image from "next/image";

export function TutiWordmark({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      className={className}
      src="/brand/tuti-wordmark.svg"
      alt="Tuti"
      width={115}
      height={46}
      priority={priority}
    />
  );
}
