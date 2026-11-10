import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { renderHarumadiPdf } from "../src/server/pdf/harumadiPdf";

test("실제 PDF도 세로 사진 비율과 긴 글의 마지막 문장을 보존한다", { timeout: 60000 }, async () => {
  const image = await sharp({ create: { width: 450, height: 800, channels: 3, background: "#8cbdef" } }).jpeg().toBuffer();
  const entries = [
    { id: "portrait", title: "세로 사진", content: "작은 하루를 남겼어요. ".repeat(130) + "세로사진마지막문장", image, visitedAt: new Date("2026-11-10"), placeName: "산책길" },
    { id: "photo-only", title: "", content: "", image, visitedAt: new Date("2026-11-10"), placeName: "" },
  ];
  const bytes = await renderHarumadiPdf({ entryIds: entries.map(entry => entry.id), title: "세로 사진 시험", coverStyle: "white-plain", coverEntryId: null, letter: "" }, entries);
  const { getDocument, OPS } = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = getDocument({ data: new Uint8Array(bytes), standardFontDataUrl: `${process.cwd()}/node_modules/pdfjs-dist/standard_fonts/` });
  try {
    const pdf = await task.promise;
    let text = "", images = 0;
    for (let index = 1; index <= pdf.numPages; index++) {
      const page = await pdf.getPage(index);
      text += (await page.getTextContent()).items.map(item => "str" in item ? item.str : "").join("");
      const operators = await page.getOperatorList();
      let matrix = [1, 0, 0, 1, 0, 0]; const stack: number[][] = [];
      operators.fnArray.forEach((op, n) => {
        if (op === OPS.save) stack.push([...matrix]);
        if (op === OPS.restore) matrix = stack.pop() ?? matrix;
        if (op === OPS.transform) {
          const [a, b, c, d, e, f] = operators.argsArray[n] as number[], [x, y, z, w, u, v] = matrix;
          matrix = [x * a + z * b, y * a + w * b, x * c + z * d, y * c + w * d, x * e + z * f + u, y * e + w * f + v];
        }
        if (op === OPS.paintImageXObject) {
          images++;
          const width = Math.hypot(matrix[0], matrix[1]), height = Math.hypot(matrix[2], matrix[3]);
          assert.ok(Math.abs(width / height - 450 / 800) < .002, "출력 이미지 행렬도 원본 세로 비율을 유지한다");
          assert.ok(height < 500, "사진은 A5 지면 안에 들어간다");
        }
      });
    }
    assert.ok(images >= 2); assert.ok(text.includes("세로사진마지막문장"));
  } finally { await task.destroy(); }
});
