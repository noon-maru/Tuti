import assert from "node:assert/strict";
import test from "node:test";
import styled from "@emotion/styled";
import { Children, isValidElement, type ReactNode } from "react";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

test("프로필 사진은 계정·프로필·revision별로 인증 조회하고 초안 사진은 전송하지 않는다", async () => {
  let options!: { queryKey: unknown[]; enabled: boolean; queryFn: (context: { signal: AbortSignal }) => Promise<unknown> };
  const requests: unknown[] = [];
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync("src/features/tuti/hooks/petPhotoQuery.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports, require: () => ({ notificationRequest: async (...args: unknown[]) => { requests.push(args); return { photo: null }; } }),
  });
  const flow = clientFlowHarness("src/features/tuti/components/PetPhoto.tsx", "PetPhoto", {
    "@tanstack/react-query": { useQuery: (input: typeof options) => { options = input; return { data: { photo: "data:image/webp;base64,YQ==" } }; } },
    "@emotion/styled": styled, "next/image": "image", "lucide-react": { Cat: "cat", Dog: "dog", Camera: "camera" },
    "../hooks/petPhotoQuery": exports,
  });
  const pet = { id: "momo", name: "모모", species: "cat", weightKg: 4, revision: 2, hasPhoto: true };
  flow.render({ owner: "owner-a", pet });
  assert.equal(options.enabled, true);
  assert.equal(JSON.stringify(options.queryKey), JSON.stringify(["pet-photo", "owner-a", "momo", 2]));
  const signal = new AbortController().signal;
  await options.queryFn({ signal });
  const request = requests[0] as [string, { signal: AbortSignal }, string];
  assert.equal(request[0], "pets/momo/photo"); assert.equal(request[1].signal, signal); assert.equal(request[2], "owner-a");
  flow.render({ owner: "owner-b", pet: { ...pet, revision: 3 } });
  assert.equal(JSON.stringify(options.queryKey), JSON.stringify(["pet-photo", "owner-b", "momo", 3]));
  flow.render({ owner: "owner-b", pet, preview: "data:image/jpeg;base64,YQ==" });
  assert.equal(options.enabled, false);
  const removed = flow.render({ owner: "owner-b", pet, preview: null });
  assert.equal(options.enabled, false);
  const children = Children.toArray(removed.props.children as ReactNode);
  assert.ok(children.some(node => isValidElement(node) && node.type === "cat"));
  flow.dispose();
});
