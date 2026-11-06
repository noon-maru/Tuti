import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { QueryClient } from "@tanstack/react-query";

test("계정 전환 뒤 마디 저장·수정·삭제·공개 응답이 다음 계정 캐시를 바꾸지 않는다", async () => {
  const a = { userId: "madi-a", accessToken: "a" }, b = { userId: "madi-b", accessToken: "b" };
  let current = a, renderIndex = 0;
  let finish!: (value: unknown) => void;
  const pending = () => new Promise(resolve => { finish = resolve; });
  const client = new QueryClient();
  type Options = { mutationFn: (input: unknown) => Promise<unknown>; onSuccess?: (value: unknown, input: unknown) => void; onError?: (error: unknown, input: unknown) => void };
  const mutations: Options[] = [];
  const exports: Record<string, unknown> = {};
  const compiled = ts.transpileModule(readFileSync("src/features/tuti/hooks/useTutiJournalEntries.ts", "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  runInNewContext(compiled, { exports, require: (name: string) => {
    if (name === "react") return { useCallback: (fn: unknown) => fn };
    if (name === "./useSession") return { useSession: () => current };
    if (name === "@/lib/auth/session") return { isSessionCurrent: (session: typeof a) => session.userId === current.userId && session.accessToken === current.accessToken };
    if (name === "@/lib/tutiApi") return { createJournalEntry: pending, updateJournalEntry: pending, deleteJournalEntry: pending, setJournalEntryPublication: pending };
    if (name === "@tanstack/react-query") return { useQueryClient: () => client,
      useQuery: ({ queryKey }: { queryKey: string[] }) => ({ data: client.getQueryData(queryKey) ?? [] }),
      useMutation: (options: Options) => {
        const index = renderIndex++; mutations[index] = options;
        return { mutateAsync: async (input: unknown) => {
          try { const result = await options.mutationFn(input); await mutations[index].onSuccess?.(result, input); return result; }
          catch (error) { await mutations[index].onError?.(error, input); throw error; }
        } };
      },
    };
    throw new Error(name);
  } });
  const hook = exports.useTutiJournalEntries as () => Record<string, (arg: unknown) => Promise<unknown>>;
  for (const method of ["addEntry", "updateEntry", "removeEntry", "changeEntryPublication"]) {
    current = a; renderIndex = 0;
    client.setQueryData(["journal-entries", a.userId], [{ id: "a-entry" }]);
    client.setQueryData(["journal-entries", b.userId], [{ id: "b-entry" }]);
    client.setQueryData(["library-cover", b.userId, "book"], "b-cover");
    const old = hook(); const saving = old[method]({});
    current = b; renderIndex = 0; hook(); // MutationObserver의 콜백도 새 렌더 옵션으로 바뀌는 상황.
    finish(method === "removeEntry" ? "a-entry" : { id: "a-late" });
    await assert.rejects(saving, /계정이 변경/);
    assert.deepEqual(client.getQueryData(["journal-entries", b.userId]), [{ id: "b-entry" }]);
    assert.equal(client.getQueryData(["library-cover", b.userId, "book"]), "b-cover");
  }
  client.clear();
});
