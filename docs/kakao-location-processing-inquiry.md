# Kakao 경로 API 위치정보 처리 관계 확인

## 공개 문서에서 확인한 내용

### Kakao 지도 API

- 카카오비즈니스 약관은 카카오디벨로퍼스를 카카오비즈니스의 비즈서비스에 포함한다.
- 같은 약관 제23조는 카카오가 카카오비즈니스 제공을 위해 회원으로부터 개인정보 처리업무를 위탁받아 수행한다고 규정한다.
- 다만 제19조는 API 사용 중 회원이 이용자 데이터를 카카오에 제공할 때 개인정보 위수탁 계약 또는 제3자 제공 동의 절차 등 관계 법령을 회원이 확인·준수하도록 규정한다.
- 공개 문서에는 Tuti가 사용하는 지도 경로 API의 출발지 좌표가 위탁 대상에 포함되는지, 요청 로그의 보유기간과 자체 이용 여부가 구체적으로 적혀 있지 않다.

확인 경로:

- 카카오비즈니스 약관: https://kakaobusiness-policy.kakao.com/SERVICE/?redirect=false
- 카카오디벨로퍼스 플랫폼 약관: https://developers.kakao.com/terms/ko/site-terms
- 카카오 지도 REST API: https://developers.kakao.com/docs/ko/kakaomap/rest-api
- 카카오 데브톡: https://devtalk.kakao.com/

### Kakao Mobility 길찾기 API

- 디벨로퍼스 운영정책과 길찾기 API 문서에서는 API 제공조건과 요청 규격을 확인할 수 있다.
- 공개 문서에는 Tuti가 전송한 출발지·목적지 좌표의 처리위탁 또는 제3자 제공 관계, 보유기간, 자체 이용 여부가 구체적으로 적혀 있지 않다.
- 공식 가격 및 문의 페이지는 제휴·파트너십 문의처로 `tech.partners@kakaomobility.com`을 안내한다.

확인 경로:

- 디벨로퍼스 운영정책: https://policy.kakaomobility.com/viewer/?pageCode=DEVELOPERS_TERMS
- 길찾기 API 문서: https://developers.kakaomobility.com/guide/navi-api/start.html
- 가격 및 문의: https://developers.kakaomobility.com/price/

## 문의할 Tuti의 실제 처리 구조

- Kakao 지도 API: Tuti 서버가 `dapi.kakao.com`에 현재 위치와 목적지의 위도·경도, 장소명 및 교통수단을 전송한다.
- Kakao Mobility 길찾기 API: Tuti 서버가 `apis-navi.kakaomobility.com`에 현재 위치와 목적지의 위도·경도 및 장소명을 전송한다.
- 두 요청 모두 Tuti 이용자 ID, 이름, 이메일, 세션 토큰은 전송하지 않는다.
- 좌표는 주변 추천의 이동 부담 평가, 이동시간·경로, 통행료와 예상 택시비 계산에 이용한다.

## 공식 문의 문안

제목: 경로 API 요청 좌표의 개인정보·개인위치정보 처리 관계 확인 요청

안녕하세요. 눈마루가 운영하는 위치기반 관광 추천 서비스 Tuti의 경로 API 이용과 관련하여 문의드립니다.

Tuti는 서버에서 귀사의 경로 API로 이용자의 현재 출발지 위도·경도와 목적지 위도·경도 및 장소명을 전송하고, 이동시간과 경로 계산 결과를 응답받습니다. 요청에는 Tuti 이용자 ID, 이름, 이메일, 세션 토큰을 포함하지 않습니다.

위치기반서비스사업 신고와 이용약관·개인정보처리방침 정비를 위하여 아래 사항을 서면으로 확인 부탁드립니다.

1. 위 좌표 처리는 Tuti의 지시에 따라 경로 산출만 수행하는 개인정보·개인위치정보 처리위탁에 해당하는지, 귀사의 독립적인 목적을 위한 제3자 제공에 해당하는지
2. 해당 판단의 근거가 되는 약관, 계약 또는 별도 개인정보 처리위탁 조항
3. 요청 좌표와 접근·요청 로그의 보유 항목, 보유기간, 파기 방법
4. 좌표 또는 요청 로그를 서비스 개선, 분석 등 독립적인 목적으로 이용하는지
5. 재위탁 또는 국외 이전이 발생하는지
6. 별도의 개인정보 처리위탁 계약, DPA 또는 개발자 콘솔 설정이 필요한지

사용 API와 호스트는 다음과 같습니다.

- Kakao 지도 API: `dapi.kakao.com`
- Kakao Mobility 길찾기 API: `apis-navi.kakaomobility.com/v1/directions`

회신은 Tuti의 위치정보 관련 준수 증빙으로 보관할 예정입니다. 감사합니다.

눈마루 / 대표 정연한  
admin@tuti.today  
010-2724-4307
