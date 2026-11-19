import assert from "node:assert/strict";
import test from "node:test";
import styled from "@emotion/styled";
import { Children, isValidElement, type ReactElement, type ReactNode } from "react";
import { clientFlowHarness } from "./fixtures/clientFlowHarness";
import { harumadiContent } from "./fixtures/harumadiContent";
import * as policy from "@/shared/legal/sensitiveJournalPolicy";
import * as fields from "@/shared/api/firstJournal";
import * as copy from "@/shared/tuti/madiFields";
import { madiEditDraftSource, type MadiDraft } from "@/lib/madiDraft";
import type { JournalEntryInput, TutiJournalEntry } from "@/shared/api/journal";

const nodes = (root: ReactNode): ReactElement<Record<string, unknown>>[] => Children.toArray(root).flatMap(node => isValidElement<Record<string, unknown>>(node) ? [node, ...nodes(node.props.children as ReactNode)] : []);
const flush = () => new Promise<void>(resolve => setImmediate(resolve));
function fixture(entry: TutiJournalEntry) {
  let input!: JournalEntryInput, fail = false, value!: MadiDraft, restore!: (draft: MadiDraft) => void;
  let completed = 0;
  const flow = clientFlowHarness("src/features/tuti/screens/journal/JournalEditorScreen.tsx", "JournalEditorScreen", {
    "@emotion/styled": styled, "lucide-react": { ImagePlus: "icon" },
    "@/shared/ui/typography": { screenTitleStyles: "", inputControlStyles: "", nativeDateInputStyles: "" },
    "@/features/tuti/components/MadiLoadNotice": { MadiLoadNotice: "notice" },
    "@/features/tuti/components/MadiFieldLabel": { MadiFieldLabel: "span" }, "@/shared/tuti/madiFields": copy,
    "@/features/tuti/components/buttons": { BackButton: "button", PrimaryButton: "button", TextButton: "button" },
    "@/features/tuti/components/ContextMenu": { ContextMenu: "menu" },
    "@/features/tuti/components/ImageCropDialog": { ImageCropDialog: "crop" },
    "@/features/tuti/components/JournalPlacePicker": { JournalPlacePicker: "place" },
    "@/features/tuti/components/ScreenFrame": { ScreenFrame: "section" },
    "@/features/tuti/components/LoadingIndicator": { LoadingIndicator: "loading", AppLoadingScreen: "loading" },
    "@/features/tuti/components/PhotoLocationConsentDialog": { PhotoLocationConsentDialog: "consent" },
    "@/features/tuti/lib/readImageMetadata": { readImageMetadata: async () => ({}) },
    "@/lib/tutiApi": { fetchLocationConsent() {}, fetchNearbyPlaces() {}, fetchSensitiveJournalPolicy: async () => ({ enabled: false, version: policy.SENSITIVE_JOURNAL_CONSENT_VERSION }) },
    "@/shared/legal/sensitiveJournalPolicy": policy,
    "@/features/tuti/components/JournalAdditionalSettings": { JournalAdditionalSettings: "additional" },
    "@/shared/location/terms": { getLocationTermsVersion: () => "test" },
    "@/store/tuti": { useTutiStore: (select: (state: unknown) => unknown) => select({}) }, "@/styles/tokens": { journalImageMaxWidth: "350px" },
    "@/features/tuti/hooks/useMadiDraft": { useMadiDraft: (options: { value: MadiDraft; restore: typeof restore }) => {
      value = options.value; restore = options.restore; return { ready: true, notice: "", leave: async () => {}, finish: async () => { completed++; } };
    } },
    "@/features/tuti/navigation/androidBack": { ANDROID_BACK_EVENT: "back" }, "@/shared/api/firstJournal": fields,
    "@/features/tuti/components/MadiFieldFeedback": { MadiFieldFeedback: "feedback" },
    "@/features/tuti/components/PetProfiles": { PetProfiles: "pets" }, "@/lib/madiDraft": { madiEditDraftSource },
  }, { window: new EventTarget() });
  const props = { entry, onBack() {}, onSubmit: async (draft: JournalEntryInput) => { input = draft; if (fail) throw Error("conflict"); } };
  const render = () => nodes(flow.render(props));
  const start = async () => { render(); flow.effects(); await flush();
    const picker = render().find(node => "$image" in node.props)!;
    (picker.props.ref as { current: unknown }).current = {};
    (render().find(node => typeof node.props.onToggle === "function")!.props.onToggle as (event: unknown) => void)({ currentTarget: { open: true } });
  };
  const submit = async () => { (render().find(node => node.props.children === "수정하기")!.props.onClick as () => void)(); await flush(); };
  return { render, start, submit, flow, props, get input() { return input; }, get value() { return value; }, get completed() { return completed; }, fail: () => { fail = true; }, restore: (draft: MadiDraft) => restore(draft) };
}

test("마디 다듬기는 기존 반려동물 연결을 표시하고 모두 해제도 버전과 함께 저장한다", async () => {
  const entry = { ...harumadiContent().entries[0], version: "2026-11-19T00:00:00.000Z", pets: [{ id: "momo", name: "몽실이", species: "dog" as const, weightKg: 3 }] };
  const f = fixture(entry); await f.start();
  const pets = f.render().find(node => node.type === "pets")!;
  assert.equal((pets.props.selected as string[])[0], "momo");
  (pets.props.onChange as (ids: string[]) => void)([]);
  await f.submit(); assert.equal(f.input.petIds?.length, 0); assert.equal(f.input.expectedVersion, entry.version);
  assert.equal(f.completed, 1); f.flow.dispose();
});

test("반려동물 수정 실패와 초안 복원은 선택을 보존하고 미확인 연결은 지우지 않는다", async () => {
  const entry = { ...harumadiContent().entries[0], pets: [] };
  const f = fixture(entry); await f.start(); f.fail();
  (f.render().find(node => node.type === "pets")!.props.onChange as (ids: string[]) => void)(["pet-a"]);
  await f.submit(); assert.equal(f.input.petIds?.[0], "pet-a"); assert.equal(f.completed, 0);
  assert.equal(f.value.petIds?.[0], "pet-a");
  f.restore({ ...f.value, petIds: ["pet-b"] });
  assert.equal((f.render().find(node => node.type === "pets")!.props.selected as string[])[0], "pet-b"); f.flow.dispose();
  const unknown = fixture(harumadiContent().entries[0]); await unknown.start();
  assert.equal(unknown.render().some(node => node.type === "pets"), false);
  await unknown.submit(); assert.equal("petIds" in unknown.input, false); unknown.flow.dispose();
});
