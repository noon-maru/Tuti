import assert from "node:assert/strict";
import test from "node:test";

import { createJournalPublicShareData } from "../src/lib/journalShare.ts";

test("공개 기록 웹 링크 공유 정보에 사용자 계정 정보 없이 장소와 제목만 담는다", () => {
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
      text: "서울숲에서 남긴 기록이에요.",
      url: "https://tuti.today/shared/abcdefghijklmnopqrstuvwxyzABCDEF",
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
      text: "오늘의 공간에서 남긴 기록이에요.",
      url: "https://tuti.today/shared/example",
    },
  );
});
