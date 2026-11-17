# 브랜드 에셋 원본

- `assets/capacitor/`: `pnpm assets:generate`가 읽는 PNG 원본
- `public/brand/`: UI용 SVG 심볼과 워드마크
- `public/app-icons/`: 생성된 PWA·Apple 아이콘

경로는 저장소 루트 기준이다. `public/app-icons/`를 직접 편집하지 말고 원본을
바꾼 뒤 재생성한다. Android·iOS 생성 결과도 각 빌드 문서의 절차로 확인한다.

전체 기준은 [문서 안내](../docs/README.md), 앱 반영은
[Android](../docs/android-build.md)·[iOS](../docs/ios-build.md)를 따른다.

## 2.0 대표 예시 사진 (2026-11-17)

생성 도구: built-in image_gen. 실제 사용자·반려동물 사진이 아닌 가상 예시다.
원본 PNG를 960px 너비 WebP(quality 84)로 최적화했으며, 예시 지면의 PDF 레이아웃은 변경하지 않았다.

- `public/welcome/dog-walk-example-v2.webp`: 반려견과 동네 산책
- `public/welcome/cat-at-home-example-v2.webp`: 반려묘의 집 안 일상

최종 프롬프트:

```text
Use case: photorealistic-natural. Asset type: illustrative sample photograph for Tuti, a quiet personal lifelog app. A small mixed-breed dog with a plain harness on a leash pauses beside its owner's sneakers on an ordinary neighborhood walking path in South Korea. Only shoes and lower legs of an adult visible, no recognizable face. Candid phone-photo feeling, soft natural daylight, understated everyday moment, realistic anatomy. Landscape 4:3 framing, main subjects comfortably inside middle 70 percent so thumbnails crop gracefully. No lettering, logos, watermark or UI. This is a fictional illustrative example, not a real user's record.
```
```text
Use case: photorealistic-natural. Asset type: illustrative sample photograph for Tuti, a quiet personal lifelog app. An ordinary domestic tabby cat resting on a cushion beside an apartment window, looking out at soft daylight. Cozy everyday South Korean home, a plain blanket, no staged luxury decor. Candid phone photograph, natural fur and anatomy, peaceful but not sentimental. Landscape 4:3 framing, cat comfortably inside middle 70 percent for thumbnails. No people, lettering, logos, watermark or UI. Fictional illustrative example, not a real user's record.
```
