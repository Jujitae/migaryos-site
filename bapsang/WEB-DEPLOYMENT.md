# 밥상 웹 배포

공개 앱 주소: https://migaryos.com/bapsang/app/
버전: 1.1.1
원본 소스 커밋: `2a4a8a9a9dc59997e0698e061faaba86bc727ea5`

`app/`은 밥상 원본의 `dist/`와 `npm run build:site`가 생성하는 `artifacts/web-runtime.js`, `artifacts/web-index.html`로 구성됩니다. 공개 index에는 회사 도메인의 canonical URL을 추가합니다. 단일 웹 번들은 업데이트 후 오래된 개별 모듈 캐시가 섞이는 것을 방지합니다. 이후 기능 변경 시 같은 방식으로 갱신합니다.

공개 상품 가격 새로고침은 밥상 소유자가 운영하는 https://bapsang-kitchen.mettl.chatgpt.site/api/retail/kurly/<reviewed-sku> 읽기 전용 서비스에 요청합니다. 개인 식단·알레르기·보유 재료·유통사 로그인은 전송하지 않으며, 검토한 공개 SKU만 조회합니다. 구매자 장바구니 자동 쓰기 연동은 없습니다.

회사 루트의 WIE 생성 페이지와 DNS·메일 설정은 수정하지 않습니다. 브라우저 저장소는 origin별입니다. 이전 ChatGPT Sites의 데이터는 해당 앱 정보의 백업 후 회사 주소의 백업 가져오기로 옮깁니다. 회사 주소 내의 기존 데이터와 설치형 앱의 기기 저장소는 기존 형식을 읽습니다.
