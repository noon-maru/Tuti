import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("로그인은 현재 계정의 마디 갱신 때문에 복귀 화면을 기다리지 않는다", () => {
  const source = readFileSync("src/features/tuti/flows/AccountFlow.tsx", "utf8");
  const finish = source.split("const finishAccountChange")[1]!.split("useEffect")[0]!;
  assert.match(finish, /void queryClient.invalidateQueries\(\{ queryKey: \["journal-entries", owner\]/);
  assert.doesNotMatch(finish, /await queryClient.invalidateQueries/);
  assert.match(finish, /getSessionSnapshot\(\)\?\.userId !== owner/);
  assert.match(finish, /loginSuccessPath\(destination, owner\)/);
  assert.equal(finish.match(/pendingHarumadiInvite\(true\)/g)?.length, 1);
});

test("함께 채우기 변경은 서버 성공 후 반영하되 목록 재조회를 기다리지 않는다", () => {
  const source = readFileSync("src/features/tuti/components/HarumadiTogetherPanel.tsx", "utf8");
  const confirmed = source.split("await changeTogether(owner, bookId, type, target);")[1]!.split("} catch")[0]!;
  assert.match(confirmed, /setConfirmation\(null\)/);
  assert.match(confirmed, /book.id !== bookId/);
  assert.match(confirmed, /client.removeQueries\(\{ queryKey: \["harumadi-comments", owner, bookId\]/);
  assert.match(confirmed, /void client.invalidateQueries[\s\S]*onExit\(\)/);
  assert.doesNotMatch(source, /await (?:refresh\(\)|client.invalidateQueries|Promise.all)/);
});

test("서버 PDF 저장 뒤 같은 파일을 열고 표지 업로드·초안 정리를 기다리지 않는다", () => {
  const source = readFileSync("src/features/tuti/flows/HarumadiPdfFlow.tsx", "utf8");
  const completion = source.split("async function completeHarumadi()")[1]!.split("if (loadError)")[0]!;
  assert.ok(completion.indexOf("await createHarumadiPdf") < completion.indexOf("setOpenedHarumadi(harumadiPdf)"));
  assert.ok(completion.indexOf("setOpenedHarumadi(harumadiPdf)") < completion.indexOf("void saveLibraryCover"));
  assert.doesNotMatch(completion, /await (?:saveLibraryCover|removeHarumadiPdfDraft)/);
  assert.match(source, /savedBytes=\{savedPreview\?\.bytes\}/);
  assert.match(source, /getSessionSnapshot\(\)\?\.userId !== ownerId/);
  const preview = readFileSync("src/features/tuti/components/HarumadiPdfPreview.tsx", "utf8");
  assert.match(preview, /const localBytes = attempt === 0 \? savedBytes : undefined/);
  assert.match(preview, /localBytes \? null : await fetchWithSession/);
  assert.match(preview, /data: bytes.slice\(\)/);
});
