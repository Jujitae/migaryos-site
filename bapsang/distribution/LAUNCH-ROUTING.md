# 밥상 광고·설치 연결 준비

광고 공통 주소: **https://migaryos.com/bapsang/install/**

앱 기능은 1.3.0(build 8)에서 동결했다. 이번 변경은 회사 웹사이트의 설치 안내·광고 목적지와 운영 자료이며 앱 바이너리를 바꾸지 않는다. 기존 웹 주소와 직접 설치 APK는 계속 제공한다.

## 현재 상태 — 2026-10-31

스토어 심사 대기 상태가 아니다. 확인된 기록상 Google Play 개발자 조직 인증·D-U-N-S 확인 및 실제 앱 레코드/제출이 남아 있다. Android 서명 AAB·APK와 ARM 가상 Android 15 검증 자료·원본 스크린샷은 준비됐다. Google Play 한국 공개 URL의 현재 응답은 HTTP 404다.

Apple은 개발자 멤버십·Team ID·App Store 앱 숫자 ID가 확인되지 않았다. iOS 소스는 있으나 서명 빌드·기기/시뮬레이터 검증·제출은 끝나지 않았다. 확인되지 않은 App Store ID, 승인, 설치 URL을 생성하지 않는다. 실제 계정 상태가 바뀌면 콘솔 증거로 갱신한다.

현재 공개 설정 `../install/config.json`은 양쪽 모두 `not_submitted`, URL과 공개 확인 시각은 null이다. 출시 준비 문구와 웹 시작 버튼을 표시하며 스토어 또는 APK로 자동 이동하지 않는다.

## 방문자의 이동

| 기기 | 해당 스토어 공개 확인 후 | 공개 확인 전 |
| --- | --- | --- |
| Android | Google Play 밥상 설치 화면으로 자동 연결 | 웹 시작 안내; 직접 APK 설치는 선택 링크 |
| iPhone / iPad | App Store 밥상 설치 화면으로 자동 연결 | 웹 시작 안내 |
| PC / 일반 Mac | 공개된 스토어 선택 버튼과 웹 버튼 | 웹 시작 안내 |

iPad의 데스크톱 보기 UA도 터치 정보를 함께 판별한다. 공개된 플랫폼만 각각 전환한다. 링크를 되돌아왔을 때 무한 재이동하지 않도록 `location.replace`를 사용한다. 웹뷰에서 외부 스토어 열기가 제한되면 스토어 버튼과 외부 브라우저 안내가 남는다. 실제 Instagram/카카오톡/Safari/Chrome과 스토어 앱의 최종 연동은 공개된 진짜 앱으로 기기에서 검수해야 한다. UA 에뮬레이션은 이 검수를 대신하지 않는다.

승인은 공개 설치 가능 상태와 다를 수 있다. 승인 통지만으로 `published`를 켜지 않고 대한민국에서 실제 공개 제품 페이지와 앱 식별자를 확인한 뒤 전환한다. 기존 광고의 공통 URL은 바꿀 필요가 없다.

## 공개 후 활성화

Node 22 이상. 명령은 회사 사이트 저장소 루트에서 실행한다. 프록시 환경에서 지원되는 Node는 `node --use-env-proxy`를 사용한다.

```sh
node bapsang/distribution/enable-store.mjs --platform android
```

iOS는 App Store Connect에서 실제 발급된 숫자 App ID를 확인한 뒤 아래 명령의 인자로 전달한다. 인증용 Team ID나 번들 ID를 숫자 App ID 대신 넣지 않는다.

```text
node bapsang/distribution/enable-store.mjs --platform ios --app-store-id 실제_발급된_숫자_App_ID
```

이 명령은 공개 Google Play의 앱 이름·패키지·무료 가격·개발자 또는 한국 Apple Lookup의 앱 이름·숫자 ID·번들·무료 가격을 검증한다. HTTP 오류·다른 앱·메타데이터 변경 시 설정을 쓰지 않는다. 성공하면 해당 플랫폼의 `status`, 실제 `url`, `verifiedAt`만 갱신한다. 앱 ID 없이 iOS를 활성화할 수 없다. 스토어 HTML 구조가 바뀌면 검증기를 점검하고 실제 공개 앱을 다시 확인한다.

```sh
node --test bapsang/distribution/tests/*.test.mjs
git diff -- bapsang/install/config.json
```

변경된 설정과 검증 결과를 검토하고 회사 사이트에 커밋·게시한 다음 실제 휴대폰에서 공통 광고 URL과 수동 스토어 버튼을 확인한다. 중단이 필요하면 해당 `status`를 `paused`로 바꿔 게시하면 웹 안내로 복귀한다. 외부 주소를 쿼리로 받아 이동하지 않는다.

## 광고 링크와 측정 범위

`ad-links.csv`에 릴스·스토리·피드·프로필용 주소를 준비했다. `ad-copy.ko.json`은 출시 전 웹 미리 사용 문구와 실제 스토어 공개 후 설치 문구를 분리한다. 광고 집행·예산·결제·플랫폼 광고 심사 신청은 실행하지 않았다.

공통 링크는 웹사이트 트래픽 광고나 프로필 링크의 목적지로 쓸 수 있다. Meta의 앱 설치 최적화 캠페인은 별도 앱 등록·OS별 목적지·측정 설정이 필요한 작업이며 지금 설정됐다고 간주하지 않는다. 대상 OS가 미공개인 동안 설치를 약속하는 광고를 집행하지 않는다. 한국 공개를 확인한 범위로 먼저 운영한다.

UTM 5개 필드만 선택적으로 전달한다. Google Play에는 `referrer` 문자열을 넣고 웹 대안에도 UTM을 유지한다. 앱에는 Install Referrer 수집 SDK를 추가하지 않았으므로 링크 전달만으로 설치 전환 수집이 완성되지 않는다. 광고 클릭 식별자·식단·건강 설정을 설치 페이지에서 수집하거나 저장하지 않으며 쿠키·픽셀·분석/광고 SDK도 추가하지 않았다.

Apple `pt`는 App Store Connect에서 실제 발급된 provider token이 있을 때만 설정한다. `--provider-token`을 iOS 활성화 명령에 선택적으로 추가할 수 있다. 토큰이 있고 `utm_campaign`이 전달된 경우만 공식 `pt`·`ct`·`mt` 형식으로 연결한다. 토큰을 임의 생성하지 않으며 App Store Connect에서 캠페인 생성이 가능한 시점에 설정한다. 공식 안내상 계정에 분석 데이터가 있어야 캠페인 생성 기능이 나타날 수 있다.

## 제출·공개 전에 남은 작업

1. Google Play 실제 개발자 계정/프로덕션 접근과 사업자 인증을 완료하고 밥상 앱 레코드를 만든다. 적용되는 테스트 요구는 실제 계정 콘솔 기준으로 확인한다.
2. 준비한 Android 1.3.0 서명 AAB, 원본 화면, 정책/지원 URL, 개인정보·데이터 안전 설문을 검토해 업로드·제출한다.
3. Apple 개인사업자 Individual 멤버십·Team ID·앱 숫자 ID를 확보하고 iOS 서명 빌드·테스트·실제 화면·개인정보 항목을 완성한 뒤 제출한다.
4. 국가별 공개 설치 가능 여부를 확인한 플랫폼부터 설치 링크를 활성화한다.
5. Instagram 인앱 브라우저와 Android Chrome / iPhone Safari의 실제 스토어 설치 화면을 검수한 뒤 해당 OS 광고를 집행한다.

공식 근거: [Google Play 설치 화면 링크](https://developer.android.com/distribute/marketing-tools/linking-to-google-play), [Google Play Install Referrer](https://developer.android.com/google/play/installreferrer), [Apple 캠페인 링크](https://developer.apple.com/help/app-store-connect-analytics/acquisition/campaign-links).
