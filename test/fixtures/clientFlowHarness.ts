import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as React from "react";
import * as jsx from "react/jsx-runtime";

/** Exercise real flow handlers with browser/service boundaries substituted, not reimplemented. */
export function clientFlowHarness(file: string, name: string, deps: Record<string, unknown>, globals: Record<string, unknown> = {}) {
  const states: unknown[] = [], refs: Array<{ current: unknown }> = [];
  const effects: Array<{ deps?: unknown[]; cleanup?: () => void; run?: () => void | (() => void) }> = [];
  let stateIndex = 0, refIndex = 0, effectIndex = 0;
  const hooks = { ...React,
    useState(initial: unknown) { const index = stateIndex++; if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
      return [states[index], (next: unknown) => { states[index] = typeof next === "function" ? next(states[index]) : next; }]; },
    useRef(initial: unknown) { const index = refIndex++; return refs[index] ?? (refs[index] = { current: initial }); },
    useCallback: (callback: unknown) => callback,
    useEffect(run: () => void | (() => void), dependencies?: unknown[]) {
      const index = effectIndex++, old = effects[index];
      if (!old || !dependencies || dependencies.some((value, i) => value !== old.deps?.[i])) {
        old?.cleanup?.(); effects[index] = { deps: dependencies, run };
      }
    },
  };
  const exports: Record<string, (props: unknown) => React.ReactElement<Record<string, unknown>>> = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(file, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText, { exports, URL, URLSearchParams, crypto, console, ...globals, require: (id: string) => {
    if (id === "react") return hooks;
    if (id === "react/jsx-runtime") return jsx;
    if (!(id in deps)) throw new Error(`Unexpected dependency ${id}`);
    return deps[id];
  } });
  return {
    render(props = {}, child?: (props: unknown) => React.ReactElement<Record<string, unknown>>) {
      stateIndex = 0; refIndex = 0; effectIndex = 0; return (child ?? exports[name])(props);
    },
    effects() { for (const effect of effects) { const run = effect.run; effect.run = undefined; if (run) effect.cleanup = run() || undefined; } },
    dispose() { for (const effect of effects) effect.cleanup?.(); },
  };
}
