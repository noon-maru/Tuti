import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { installDialogScope } from "@/shared/ui/dialogScope";
import { ANDROID_BACK_EVENT } from "@/features/tuti/navigation/androidBack";

// A minimal DOM boundary harness, not a browser rendering/accessibility test.
function environment(t: { after: (fn: () => void) => void }) {
  class Element extends EventTarget {
    children: Element[] = [];
    parentElement: Element | null = null;
    inert = false; disabled = false; hidden = false; tabIndex = -1; isConnected = true;
    style = { overflow: "auto" };
    append(node: Element) { this.children.push(node); node.parentElement = this; return node; }
    querySelectorAll(): Element[] { return this.children.flatMap(node => [node, ...node.querySelectorAll()]); }
    contains(node: unknown): boolean { return node === this || this.children.some(child => child.contains(node)); }
    matches() { return this.disabled; }
    closest(selector: string): Element | null { return (this.inert || (selector !== "[inert]" && this.hidden)) ? this : this.parentElement?.closest(selector) ?? null; }
    getClientRects() { return this.hidden ? [] : [{}]; }
    focus() { doc.activeElement = this; doc.dispatchEvent(new Event("focusin")); }
  }
  const doc = Object.assign(new EventTarget(), { activeElement: null as Element | null, body: new Element() });
  const win = new EventTarget();
  const saved = ["document", "window", "HTMLElement"].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)] as const);
  for (const [key, value] of Object.entries({ document: doc, window: win, HTMLElement: Element })) Object.defineProperty(globalThis, key, { configurable: true, value });
  t.after(() => { for (const [key, descriptor] of saved) { if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key); } });
  const root = doc.body.append(new Element()), main = root.append(new Element());
  const opener = main.append(new Element()); opener.tabIndex = 0; opener.focus();
  const layer = () => {
    const backdrop = root.append(new Element()), dialog = backdrop.append(new Element());
    const first = dialog.append(new Element()), last = dialog.append(new Element());
    first.tabIndex = last.tabIndex = 0;
    return { backdrop, dialog, first, last };
  };
  const key = (name: string, shiftKey = false) => {
    const event = Object.assign(new Event("keydown", { cancelable: true }), { key: name, shiftKey });
    win.dispatchEvent(event); return event;
  };
  const install = (dialog: Element, first: Element, onCancel: () => void, canDismiss = () => true) => installDialogScope({
    dialog: dialog as unknown as HTMLElement, initialFocus: () => first as unknown as HTMLElement, onCancel, canDismiss,
  });
  return { doc, win, main, opener, layer, key, install };
}

test("모달은 첫 포커스·양방향 Tab·외부 포커스 차단과 복귀를 처리한다", t => {
  const e = environment(t), layer = e.layer();
  const release = e.install(layer.dialog, layer.first, () => {}); t.after(release);
  assert.equal(e.doc.activeElement, layer.first);
  assert.equal(e.main.inert, true);
  assert.equal(e.doc.body.style.overflow, "hidden");
  assert.equal(e.key("Tab", true).defaultPrevented, true);
  assert.equal(e.doc.activeElement, layer.last);
  e.key("Tab"); assert.equal(e.doc.activeElement, layer.first);
  e.opener.focus(); assert.equal(e.doc.activeElement, layer.first);
  layer.first.disabled = true;
  e.opener.focus(); assert.equal(e.doc.activeElement, layer.last);
  release();
  assert.equal(e.doc.activeElement, e.opener);
  assert.equal(e.main.inert, false);
  assert.equal(e.doc.body.style.overflow, "auto");
});

test("겹친 모달에서는 맨 위만 뒤로가기를 처리하고 닫힘 금지와 잠금 수명을 지킨다", t => {
  const e = environment(t), parent = e.layer(); let parentClosed = 0, childClosed = 0, allowed = false;
  const releaseParent = e.install(parent.dialog, parent.first, () => parentClosed++); t.after(releaseParent);
  const child = e.layer();
  const releaseChild = e.install(child.dialog, child.first, () => childClosed++, () => allowed); t.after(releaseChild);
  e.key("Escape"); assert.equal(parentClosed + childClosed, 0);
  allowed = true;
  e.win.dispatchEvent(new Event(ANDROID_BACK_EVENT, { cancelable: true }));
  assert.equal(childClosed, 1); assert.equal(parentClosed, 0);
  releaseChild();
  assert.equal(e.doc.activeElement, parent.first);
  assert.equal(e.main.inert, true); assert.equal(e.doc.body.style.overflow, "hidden");
  e.key("Escape"); assert.equal(parentClosed, 1);
  releaseParent(); assert.equal(e.main.inert, false);
});

test("부모가 먼저 사라져도 중첩 잠금은 마지막 모달이 닫힐 때 복구한다", t => {
  const e = environment(t), parent = e.layer();
  const releaseParent = e.install(parent.dialog, parent.first, () => {}); t.after(releaseParent);
  const child = e.layer(), releaseChild = e.install(child.dialog, child.first, () => {}); t.after(releaseChild);
  releaseParent(); assert.equal(e.main.inert, true);
  releaseChild(); assert.equal(e.main.inert, false); assert.equal(e.doc.body.style.overflow, "auto");
});

test("자체 배경을 가진 애니메이션 레이어는 바깥 형제만 잠그고 내부 조작부는 유지한다", t => {
  const e = environment(t), layer = e.layer();
  const release = installDialogScope({
    dialog: layer.backdrop as unknown as HTMLElement,
    isolationRoot: layer.backdrop as unknown as HTMLElement,
    initialFocus: () => layer.first as unknown as HTMLElement,
    onCancel: () => {}, canDismiss: () => true,
  });
  t.after(release);
  assert.equal(e.main.inert, true);
  assert.equal(layer.dialog.inert, false);
  assert.equal(e.doc.activeElement, layer.first);
  layer.last.focus(); e.key("Tab");
  assert.equal(e.doc.activeElement, layer.first);
  release(); assert.equal(e.doc.activeElement, e.opener);
});

test("출발 준비 세 레이어는 애니메이션·히스토리를 유지하며 공통 포커스 수명을 사용한다", () => {
  for (const name of ["DeparturePlanScreen", "ExpandedDeparturePlanScreen", "FullscreenDeparturePlanScreen"]) {
    const source = readFileSync(`src/features/tuti/screens/departure/${name}.tsx`, "utf8");
    assert.match(source, /useLayerDialogScope\(dialogRef/);
    assert.match(source, /ref=\{dialogRef\}/);
    assert.match(source, /tabIndex=\{/);
    assert.doesNotMatch(source, /closeFromEscape/);
    assert.match(source, /window.history.back\(\)/);
  }
  const source = readFileSync("src/features/tuti/screens/departure/DeparturePlanScreen.tsx", "utf8");
  assert.match(source, /enabled: !embedded/);
  assert.match(source, /aria-label="출발 준비 닫기" data-dialog-initial-focus/);
  const hook = readFileSync("src/shared/ui/useLayerDialogScope.ts", "utf8");
  assert.match(hook, /isolationRoot: node/);
  assert.match(hook, /document.activeElement === node/);
  assert.match(hook, /canDismiss: \(\) => !latest.current.closing/);
});

test("일반·동의·중요 확인 모달은 같은 앱 프레임과 전체 필드 포커스를 사용한다", () => {
  const source = readFileSync("src/shared/ui/dialogScope.ts", "utf8");
  assert.match(source, /textarea, select, a\[href\]/);
  const frame = readFileSync("src/shared/ui/AppDialogFrame.tsx", "utf8");
  assert.match(frame, /role = "alertdialog"/); assert.match(frame, /role=\{role\}/);
  assert.match(frame, /viewport \?\? document.body/);
  for (const name of ["ShareDialogFrame", "PhotoLocationConsentDialog", "JournalPublicationConsentDialog", "HarumadiPurchaseButton"]) {
    const content = readFileSync(`src/features/tuti/components/${name}.tsx`, "utf8");
    assert.match(content, /<AppDialogFrame role="dialog"/);
    assert.doesNotMatch(content, /createPortal|window.addEventListener/);
  }
  assert.match(readFileSync("src/features/tuti/components/PhotoLocationConsentDialog.tsx", "utf8"), /onCancel=\{onDecline\}/);
  assert.match(readFileSync("src/features/tuti/components/JournalPublicationConsentDialog.tsx", "utf8"), /busy=\{submitting\}/);
  const crop = readFileSync("src/features/tuti/components/ImageCropDialog.tsx", "utf8");
  assert.match(crop, /styled\(AppDialogFrame\)/);
  assert.match(crop, /presentation="fullscreen" busy=\{processing\}/);
  assert.match(crop, /ref=\{cancel\} type="button" disabled=\{processing\}/);
});
