# PDF용 Pretendard

PDF 생성에 사용할 정적 Pretendard WOFF 파일을 `public/fonts/pretendard`에
포함한다. 웹 화면은 기존 WOFF2를 그대로 사용한다. 추가 npm 폰트 패키지나
운영체제 폰트 설치는 필요하지 않다.

- 원본: [Pretendard v1.3.9](https://github.com/orioncactus/pretendard/tree/v1.3.9/packages/pretendard/dist/web/static/woff)
- 굵기: Light 300, Regular 400, Medium 500, Bold 700
- 라이선스: [SIL Open Font License 1.1](../public/fonts/pretendard/LICENSE)
- 등록 함수: [src/server/pdf/fonts.ts](../src/server/pdf/fonts.ts)

서버에서 PDF를 생성하기 전에 `registerPdfFonts()`를 호출하고 텍스트 스타일에
`fontFamily: PDF_FONT_FAMILY`를 지정한다. 등록 함수만 호출해도 모든 텍스트의
기본 글꼴이 변경되는 것은 아니다.

```tsx
import { Document, Page, Text, renderToBuffer } from "@react-pdf/renderer";
import { PDF_FONT_FAMILY, registerPdfFonts } from "@/server/pdf/fonts";

registerPdfFonts();

const pdf = await renderToBuffer(
  <Document>
    <Page style={{ fontFamily: PDF_FONT_FAMILY }}>
      <Text>우리의 작은 외출 기록</Text>
      <Text style={{ fontWeight: 700 }}>함께 걸었던 날들</Text>
    </Page>
  </Document>,
);
```

프로젝트 루트를 작업 디렉터리로 실행하는 현재 서버 구성을 기준으로 경로를
해석한다. 기존 Dockerfile은 `public`을 런타임 이미지로 복사하므로 폰트도
함께 포함된다. PDF 생성 모듈은 서버에서만 사용한다.

한글·영문·숫자용 폰트 등록이며 컬러 이모지 표시까지 보장하지 않는다.
기록집 구현 시 이모지 처리와 긴 한글 본문의 페이지 나눔은 별도로 검증한다.
