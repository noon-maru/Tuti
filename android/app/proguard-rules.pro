# R8은 Capacitor 플러그인 메서드와 권한 콜백을 런타임 애노테이션으로 찾는다.
# Capacitor Android가 기본 규칙을 제공하지만 앱에서도 이 경계를 명시해 버전 변경 시
# 애노테이션·제네릭 메타데이터가 제거되지 않도록 한다.
-keepattributes RuntimeVisibleAnnotations,RuntimeInvisibleAnnotations,AnnotationDefault
-keepattributes Signature,InnerClasses,EnclosingMethod

# 권한 요청은 Plugin -> Bridge -> BridgeActivity를 거치고 콜백 일부를 런타임에
# 해석한다. 플러그인만 보존한 1차 회귀 테스트에서도 종료가 재현됐으므로 Capacitor
# 코어 브리지 전체를 보존해 클래스 병합과 콜백 이름 변경을 함께 막는다.
-keep class com.getcapacitor.** { *; }

# 1.1.1/1.2.0에서 위치 권한을 허용한 직후 종료된 회귀의 나머지 경계다. 플러그인
# 본체뿐 아니라 실제 위치 요청을 수행하는 IONGeolocationLib의 코루틴·콜백까지
# 보존한다. 그 외 앱과 라이브러리 코드는 계속 R8 축소·최적화·난독화 대상이다.
-keep class com.capacitorjs.plugins.geolocation.** { *; }
-keep class io.ionic.libs.iongeolocationlib.** { *; }
