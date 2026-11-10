import assert from "node:assert/strict";
import test from "node:test";

import { createJournalPublicShareData } from "../src/lib/journalShare.ts";

test("공개 마디 공유는 제목과 URL을 빈 줄로 구분한 한 본문으로 전달한다", () => {
  assert.deepEqual(
    createJournalPublicShareData(
      "https://tuti.today/shared/abcdefghijklmnopqrstuvwxyzABCDEF",
      {
        placeName: "서울숲",
        title: "바람이 좋았던 오후",
      },
    ),
    {
      title: "바람이 좋았던 오후 | Tuti",
      text: "바람이 좋았던 오후 | Tuti\n\nhttps://tuti.today/shared/abcdefghijklmnopqrstuvwxyzABCDEF",
    },
  );
});

test("제목과 장소가 비어 있어도 공유 문구에 안전한 기본값을 사용한다", () => {
  assert.deepEqual(
    createJournalPublicShareData("https://tuti.today/shared/example", {
      placeName: " ",
      title: " ",
    }),
    {
      title: "지난 공간 | Tuti",
      text: "지난 공간 | Tuti\n\nhttps://tuti.today/shared/example",
    },
  );
});
