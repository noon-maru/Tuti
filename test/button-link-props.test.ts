import assert from "node:assert/strict";
import test from "node:test";
import { createElement, type ComponentPropsWithoutRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Link from "next/link";
import { ButtonLink } from "@/shared/ui/buttons";

test("Next 링크로 바꾼 공용 버튼은 스타일 속성을 DOM에 전달하지 않는다", t => {
  const errors: unknown[][] = [];
  t.mock.method(console, "error", (...args: unknown[]) => errors.push(args));
  for (const as of [undefined, Link]) {
    const props = {
      as, href: "/login", $tone: "text" as const, $size: "compact" as const, $fullWidth: true,
      "aria-label": "로그인", "data-testid": "login",
    };
    const html = renderToStaticMarkup(createElement(ButtonLink, props, "로그인"));
    assert.match(html, /<a[^>]*href="\/login"/);
    assert.match(html, /aria-label="로그인"/);
    assert.match(html, /data-testid="login"/);
    assert.match(html, /background:transparent/);
    assert.match(html, /min-height:var\(--space-10\)/);
    assert.match(html, /width:100%/);
    assert.doesNotMatch(html, /\$(?:tone|size|fullWidth)|\sas=/);
  }
  assert.deepEqual(errors, []);
});

test("공용 링크의 대상 컴포넌트에는 경로·이벤트·라우터 옵션을 유지한다", () => {
  let received: Record<string, unknown> = {};
  const onClick = () => {};
  const Target = (props: ComponentPropsWithoutRef<"a"> & { prefetch?: boolean }) => {
    received = props;
    const anchor = { ...props };
    delete anchor.prefetch;
    return createElement("a", anchor);
  };
  const props = {
    as: Target, href: "/login", prefetch: false, onClick, $tone: "text" as const, $size: "compact" as const,
  };
  renderToStaticMarkup(createElement(ButtonLink, props, "로그인"));
  assert.equal(received.href, "/login");
  assert.equal(received.prefetch, false);
  assert.equal(received.onClick, onClick);
  assert.equal(typeof received.className, "string");
  assert.equal(Object.keys(received).some(key => key.startsWith("$") || key === "as"), false);
});
