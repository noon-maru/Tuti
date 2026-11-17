import assert from "node:assert/strict";
import test from "node:test";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import styled from "@emotion/styled";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { parsePetProfile, type PetProfile } from "../src/shared/pets/profile";
import { selectedDogWeights } from "../src/shared/pets/outingProfiles";

function nodes(tree: ReactNode): ReactElement<Record<string, unknown>>[] {
  return Children.toArray(tree).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
}
const dogs: PetProfile[] = [
  { id: "dog-a", name: "구름", species: "dog", weightKg: 8, revision: 1 },
  { id: "dog-b", name: "보리", species: "dog", weightKg: null, revision: 0 },
  { id: "cat", name: "나비", species: "cat", weightKg: 4, revision: 1 },
];
test("선택한 개 모두의 몸무게가 있어야 불러오며 반려묘·없어진 프로필·중복은 제외한다", () => {
  assert.deepEqual(selectedDogWeights(dogs, ["dog-a"]), [8]);
  for (const ids of [[], ["dog-a", "dog-b"], ["cat"], ["missing"], ["dog-a", "dog-a"]]) assert.equal(selectedDogWeights(dogs, ids), null);
  assert.deepEqual(selectedDogWeights([...dogs, { ...dogs[1], id: "other", weightKg: 12 }], ["dog-a", "other"]), [8, 12]);
});

function editorFixture(options: { selection?: boolean; registrationOnly?: boolean; onRegistered?: () => void; onBusyChange?: (busy: boolean) => void; request?: (path: string, init?: RequestInit, owner?: string) => Promise<unknown>; confirm?: () => Promise<boolean> } = {}) {
  let pets = options.registrationOnly ? [] : dogs.map(pet => ({ ...pet }));
  const calls: Array<{ path: string; init?: RequestInit; owner?: string }> = [];
  const changes: string[][] = [];
  const queryEnabled: boolean[] = [];
  const query = { get data() { return { pets }; }, isPending: false, isError: false, refetch: async () => ({ data: { pets } }) };
  const flow = clientFlowHarness("src/features/tuti/components/PetProfiles.tsx", "PetProfiles", {
    "@emotion/styled": styled,
    "@tanstack/react-query": { useQueryClient: () => ({
      invalidateQueries: async () => { throw new Error("background read failed"); },
      setQueryData: (_: unknown, update: (previous: { pets: PetProfile[] }) => { pets: PetProfile[] }) => { pets = update({ pets }).pets; },
    }) },
    "../hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "../hooks/usePetProfiles": { petProfilesKey: (owner: string) => ["pet-profiles", owner], usePetProfiles: (_owner: string, enabled = true) => { queryEnabled.push(enabled); return query; } },
    "@/lib/notificationSettings": { notificationRequest: async (path: string, init?: RequestInit, owner?: string) => {
      calls.push({ path, init, owner });
      if (options.request) return options.request(path, init, owner);
      if (init?.method === "DELETE") return {};
      return { pet: { id: "new", ...JSON.parse(String(init?.body)), revision: 0 } };
    } },
    "@/shared/pets/profile": { parsePetProfile }, "@/lib/feedback": { confirmAction: options.confirm ?? (async () => true) },
    "./buttons": { PrimaryButton: "button", TextButton: "button" }, "@/shared/ui/typography": { inputControlStyles: "" },
  });
  const render = (disabled = false) => {
    const shell = flow.render({ ...(options.selection ? { selected: [], onChange: (ids: string[]) => changes.push(ids) } : {}), registrationOnly: options.registrationOnly, onRegistered: options.onRegistered, onBusyChange: options.onBusyChange, disabled });
    return nodes(flow.render(shell.props, shell.type as (props: unknown) => ReactElement<Record<string, unknown>>));
  };
  const change = (predicate: (node: ReactElement<Record<string, unknown>>) => boolean, value: string) => (render().find(predicate)!.props.onChange as (event: unknown) => void)({ target: { value } });
  const submit = () => (render().find(node => node.type === "form")!.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
  const click = (label: string) => (render().find(node => node.props.children === label)!.props.onClick as () => unknown)();
  return { render, change, submit, click, calls, changes, query, queryEnabled, effects: flow.effects, setPets: (next: PetProfile[]) => { pets = next; } };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("첫 시작 등록은 실제 서버 저장 성공 후에만 이어가며 실패 시 입력을 보존한다", async () => {
  let completed = 0;
  const working: boolean[] = [];
  let failed = true;
  const f = editorFixture({ registrationOnly: true, onRegistered: () => { completed++; }, onBusyChange: value => working.push(value), request: async () => {
    if (failed) throw new Error("not saved");
    return { pet: { id: "new-onboarding", name: "구름", species: "dog", weightKg: null } };
  } });
  assert.equal(f.render().some(node => node.props.children === "수정" || node.props.children === "삭제"), false);
  assert.ok(f.render().some(node => node.props.children === "등록하고 시작하기"));
  f.change(node => node.props.maxLength === 60, "구름");
  f.submit(); await tick();
  assert.equal(completed, 0); assert.equal(f.render().find(node => node.props.maxLength === 60)!.props.value, "구름");
  failed = false; f.submit(); await tick();
  assert.equal(completed, 1); assert.deepEqual(working, [true, false, true, false]);
});

test("첫 시작은 프로필을 조회하지 않고 캐시 유무·조회 상태와 무관하게 즉시 폼을 보여준다", () => {
  let completed = 0;
  const f = editorFixture({ registrationOnly: true, onRegistered: () => { completed++; } });
  f.render(); f.effects(); assert.equal(completed, 0);
  assert.equal(f.queryEnabled.at(-1), false);
  f.query.isError = true;
  f.change(node => node.props.maxLength === 60, "직접 입력");
  f.query.isPending = true;
  assert.notEqual(f.render().find(node => node.type === "form")!.props.hidden, true);
  assert.equal(f.render().some(node => node.props.role === "status"), false);
  f.query.isPending = false; f.query.isError = false;
  assert.equal(f.render().find(node => node.props.maxLength === 60)!.props.value, "직접 입력");
  f.setPets(dogs); f.render(); f.effects(); assert.equal(completed, 0, "캐시된 프로필로 자동 진행하지 않는다");
  assert.equal(f.queryEnabled.every(enabled => enabled === false), true);
  assert.equal(f.calls.length, 0, "폼 표시만으로 조회·등록 요청을 하지 않는다");
  const settings = editorFixture(); settings.render();
  assert.equal(settings.queryEnabled.at(-1), true, "설정의 목록 조회는 유지한다");
});

test("마디 연결란에서 바로 등록하되 자동 연결하지 않고 중복 등록을 막는다", async () => {
  let finish!: (value: unknown) => void;
  const f = editorFixture({ selection: true, request: () => new Promise(resolve => { finish = resolve; }) });
  assert.equal(f.render().some(node => node.type === "form"), false);
  f.click("새 반려동물 등록");
  f.change(node => node.props.maxLength === 60, " 구름 둘 ");
  f.submit(); f.submit();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].owner, "owner");
  assert.equal(JSON.parse(String(f.calls[0].init?.body)).name, "구름 둘");
  finish({ pet: { id: "new", name: "구름 둘", species: "dog", weightKg: null, revision: 0 } }); await tick();
  assert.equal(f.changes.length, 0, "등록만으로 마디에 연결하지 않는다");
  assert.ok(f.render().some(node => node.props.role === "status"));
  assert.equal(f.render().some(node => node.props.role === "alert"), false, "재조회 실패는 저장 실패가 아니다");
  assert.equal(f.render().some(node => node.type === "form"), false);
});

test("잘못된 몸무게와 비활성 상태에서는 API를 호출하지 않는다", () => {
  const f = editorFixture();
  f.change(node => node.props.maxLength === 60, "구름");
  f.change(node => node.props.type === "number", "0"); f.submit();
  assert.equal(f.calls.length, 0); assert.ok(f.render().some(node => node.props.role === "alert"));
  f.change(node => node.props.type === "number", "8");
  const form = f.render(true).find(node => node.type === "form")!;
  (form.props.onSubmit as (event: unknown) => void)({ preventDefault() {} });
  assert.equal(f.calls.length, 0);
});

test("수정 중 프로필을 삭제하면 수정 상태를 해제하고 원본 마디 삭제 API는 부르지 않는다", async () => {
  const f = editorFixture();
  const edit = f.render().find(node => node.props.children === "수정")!;
  (edit.props.onClick as () => void)();
  assert.ok(f.render().some(node => node.props.children === "변경사항 저장"));
  f.click("삭제"); await tick();
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].path, "pets/dog-a"); assert.equal(f.calls[0].init?.method, "DELETE");
  assert.ok(f.render().some(node => node.props.children === "프로필 등록"));
  assert.equal(f.render().find(node => node.props.maxLength === 60)!.props.value, "");
});

test("삭제 확인 중에는 다른 저장도 잠그고 취소하면 데이터를 유지한다", async () => {
  let confirm!: (value: boolean) => void;
  const f = editorFixture({ confirm: () => new Promise(resolve => { confirm = resolve; }) });
  f.change(node => node.props.maxLength === 60, "새 프로필");
  const deleting = f.click("삭제"); f.submit();
  assert.equal(f.calls.length, 0);
  confirm(false); await deleting; await tick();
  assert.equal(f.render().find(node => node.props.maxLength === 60)!.props.value, "새 프로필");
  assert.equal(f.calls.length, 0);
});

test("수정은 revision을 보내며 실패해도 입력과 수정 대상을 보존한다", async () => {
  const f = editorFixture({ request: async () => { throw new Error("다른 화면에서 바뀌었어요."); } });
  (f.render().find(node => node.props.children === "수정")!.props.onClick as () => void)();
  f.change(node => node.props.maxLength === 60, "구름 수정");
  f.submit(); await tick();
  assert.equal(f.calls[0].path, "pets/dog-a"); assert.equal(f.calls[0].init?.method, "PUT");
  assert.equal(JSON.parse(String(f.calls[0].init?.body)).revision, 1);
  assert.equal(f.render().find(node => node.props.maxLength === 60)!.props.value, "구름 수정");
  assert.ok(f.render().some(node => node.props.role === "alert"));
  assert.ok(f.render().some(node => node.props.children === "최신 내용으로 다시 채우기"));
  f.click("수정 취소");
  assert.equal(f.render().find(node => node.props.maxLength === 60)!.props.value, "");
});

test("충돌 복구는 직접 누를 때만 최신 내용을 채우고 삭제된 프로필이면 입력을 보존한다", async () => {
  const f = editorFixture({ request: async () => { throw new Error("conflict"); } });
  (f.render().find(node => node.props.children === "수정")!.props.onClick as () => void)();
  f.change(node => node.props.maxLength === 60, "내 수정");
  f.submit(); await tick();
  f.setPets([{ ...dogs[0], name: "다른 화면의 수정", revision: 2 }]);
  assert.equal(f.render().find(node => node.props.maxLength === 60)!.props.value, "내 수정");
  f.click("최신 내용으로 다시 채우기"); await tick();
  assert.equal(f.render().find(node => node.props.maxLength === 60)!.props.value, "다른 화면의 수정");
  f.submit(); await tick();
  assert.equal(JSON.parse(String(f.calls.at(-1)?.init?.body)).revision, 2);
  f.setPets([]); f.click("최신 내용으로 다시 채우기"); await tick();
  assert.equal(f.render().find(node => node.props.maxLength === 60)!.props.value, "다른 화면의 수정");
  assert.ok(f.render().some(node => node.props.children === "프로필 등록"));
});

test("프로필 조회만으로 조건을 바꾸지 않으며 선택 후 명시적으로 몸무게를 불러온다", () => {
  const applied: number[][] = [];
  const flow = clientFlowHarness("src/features/tuti/components/DogProfileWeights.tsx", "DogProfileWeights", {
    "@emotion/styled": styled, "../hooks/useSession": { useSession: () => ({ userId: "owner" }) },
    "../hooks/usePetProfiles": { usePetProfiles: () => ({ data: { pets: dogs }, isPending: false, isError: false }) },
    "@/shared/pets/outingProfiles": { selectedDogWeights }, "./buttons": { TextButton: "button" },
  });
  const render = () => {
    const shell = flow.render({ onApply: (values: number[]) => applied.push(values) });
    return nodes(flow.render(shell.props, shell.type as (props: unknown) => ReactElement<Record<string, unknown>>));
  };
  const check = (index: number, checked: boolean) => (render().filter(node => node.props.type === "checkbox")[index].props.onChange as (event: unknown) => void)({ target: { checked } });
  assert.equal(render().filter(node => node.props.type === "checkbox").length, 2, "반려묘는 동반견 선택에 나오지 않는다");
  assert.equal(applied.length, 0);
  check(0, true); check(1, true);
  assert.equal(applied.length, 0);
  assert.equal(render().find(node => node.props.children === "선택한 몸무게 불러오기")!.props.disabled, true);
  check(1, false);
  (render().find(node => node.props.children === "선택한 몸무게 불러오기")!.props.onClick as () => void)();
  assert.deepEqual(JSON.parse(JSON.stringify(applied)), [[8]]);
  assert.equal(render().some(node => node.props.checked === true), false);
});
