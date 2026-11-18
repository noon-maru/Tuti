# 사용자 화면과 PDF 서체

사용자 화면과 새 PDF의 본문은 LINE Seed KR, 하루마디 제목은
나눔스퀘어라운드를 사용한다. 첫 화면 대표 문구·빈 책장 제목에도 둥근 서체를
포인트로 쓰되 입력·버튼·날짜·장소·기능 제목은 기본 서체를 유지한다.
운영 센터와 해당 화면의 토스트·확인 창은 기존 Pretendard를 사용한다.
Tuti 워드마크와 PDF 쪽번호의 Helvetica는 변경하지 않는다.

- 기본: [LINE Seed KR 공식 배포](https://seed.line.me/index_kr.html), Regular 400·Bold 700.
  화면용 WOFF2와 PDF용 WOFF를 포함한다. [라이선스](../public/fonts/line-seed/LICENSE).
- 포인트: [나눔스퀘어라운드 공식 배포](https://hangeul.naver.com/font), Regular 400·Bold 700 TTF.
  [라이선스](../public/fonts/nanum-square-round/LICENSE).
- 운영 센터: [Pretendard v1.3.9](https://github.com/orioncactus/pretendard/tree/v1.3.9/packages/pretendard/dist/web/static/woff),
  300·400·500·600·700. [라이선스](../public/fonts/pretendard/LICENSE).
- 등록 함수: [src/server/pdf/fonts.ts](../src/server/pdf/fonts.ts)

모두 정적 원본과 OFL 1.1 전문을 저장소에 함께 포함한다. CDN·운영체제 폰트 설치·
추가 npm 폰트 패키지에 의존하지 않는다. 실제 제공되지 않는 500·600 굵기는
브라우저/PDF 렌더러의 근접 굵기 선택을 따르며 가상 굵기를 생성하지 않는다.
포인트·운영용 서체는 전역 선로드하지 않는다. 이미 저장된 PDF는 재작성하지 않는다.

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
하루마디 구현 시 이모지 처리와 긴 한글 본문의 페이지 나눔은 별도로 검증한다.
