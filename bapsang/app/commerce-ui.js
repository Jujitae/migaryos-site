import {presentBasket} from './commerce-presenter.js';
import {timeoutSignal} from './device.js';
import {INGREDIENTS as I,STORES} from './data.js';
import {won,amount} from './planner.js';
import {ONLINE_STORES,emptyShopping,validateOffer,validateShopping,storeName,searchUrl,optionsFor,comparePlans,offerRisk,restrictionKey,reviewKey,priceConditionKey,handoffState,handoffLines,lineKey,fingerprint} from './commerce.js';

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const time=s=>new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(s));
const kind={general:'일반가',member:'멤버십가',coupon:'쿠폰 적용가'};

export function createCommerce(host){
 let catalog=[],loaded=false,loading=false,loadError='',pickId=null,pickStore=null;
 const state=()=>host.state(),shop=()=>state().shopping,stores=()=>[...new Set(state().prefs.stores||[state().prefs.store])].filter(Boolean);
 const offers=()=>[...catalog,...shop().offers];
 function result(){return comparePlans(host.groceries(),stores(),offers(),state().prefs,shop());}
 const current=()=>result().current;
 function line(id){return current().lines.find(l=>l.item.id===id);}
 function settings(store){return shop().settings[store]||{branch:'',region:'',member:false,coupon:false,method:ONLINE_STORES.has(store)||catalog.some(o=>o.storeId===store&&o.source==='retailer-page')?'delivery':'pickup',fee:ONLINE_STORES.has(store)||catalog.some(o=>o.storeId===store&&o.source==='retailer-page')?null:0,freeOver:null,minimum:null,...(catalog.find(o=>o.storeId===store&&o.shippingRule)?.shippingRule||{})};}
 function presentation(plan=current()){return presentBasket(host.groceries(),plan,stores(),offers(),state().prefs,shop());}
 function priceSummary(plan,basket){
  const remaining=basket.rows.filter(r=>!host.checked()[r.item.id]),cost=remaining.reduce((n,r)=>n+r.cost,0),all=remaining.length===basket.rows.length,complete=basket.completeQuote&&all;
  return `<section class="shop-summary"><span>${remaining.length?'장보기 예상 금액':'장보기를 마쳤어요'}</span><strong>${remaining.length?(complete?'':'약 ')+won(complete?plan.total:cost):'모두 구매했어요 ✓'}</strong><p>${remaining.length?`남은 ${remaining.length}가지 · ${complete?'배송비 포함':basket.estimated?'기본 예상 단가 포함':basket.previous?'이전 조회가 포함':'상품 금액'}`:'필요한 재료를 모두 준비했어요.'}</p>${remaining.length?`<details class="shop-price-note"><summary>${complete?'가격 안내':'배송비 별도 · 가격 안내'}</summary><small>${basket.estimated||basket.previous?'기본 예상 단가 또는 이전 상품 가격을 포함한 예산 참고용 금액이에요. ':''}실제 판매가와 배송 조건은 구매하는 매장에서 달라질 수 있어요.</small></details>`:''}</section>`;
 }
 function itemRow(row){
  const {item,q,store}=row,done=!!host.checked()[item.id];
  return `<article class="grocery-row commerce-row ${done?'checked':''}"><div class="shop-item-top"><span class="ingredient-emoji">${item.emoji}</span><div><b>${esc(item.name)}</b><span>살 양 <strong>${amount(item.need)}${item.unit}</strong></span></div><button class="grocery-check shop-check" data-a="check" data-id="${item.id}" aria-label="${esc(item.name)} 구매 완료" aria-pressed="${done}">${done?'✓':''}</button></div><div class="shop-product ${q?'':'shop-reference'}"><span class="shop-store-tag">${q?esc(storeName(store))+' · '+(store==='costco'?'회원 구매가':kind[q.offer.priceKind])+(store==='homeplus'&&q.offer.priceKind==='general'?' · 쿠폰 적용 전':'')+(row.source==='previous'?' · 이전 조회가':''):'기본 규격 · 예상 단가'}</span>${q?`<b>${esc(q.offer.name)}</b>`:''}<p><span>${amount(row.packQuantity)}${item.unit} × ${row.packs}팩</span><strong>${row.source==='estimate'?'약 ':''}${won(row.cost)}</strong></p><small>총 ${amount(row.purchased)}${item.unit} · 사용 후 ${amount(row.leftover)}${item.unit} 남아요${q?' · '+time(q.offer.observedAt)+' 조회':''}</small>${row.discountPreview?`<small class="shop-coupon-preview">쿠폰 조건 충족 시 ${won(row.discountPreview.offer.price)} / 팩 · 상품 옵션에서 적용</small>`:''}${q&&['homeplus','costco','ssg','lotte'].includes(store)?`<small>${esc(q.offer.context)}</small>`:''}</div><div class="shop-row-actions"><a class="shop-purchase-link" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer" ${q?.eligible?`data-shop-open="${item.id}"`:''}>${esc(storeName(store))}에서 ${row.directProduct?'상품 보기':'찾기'} ↗</a><button data-a="shop-pick" data-id="${item.id}" aria-label="${esc(item.name)} 상품 옵션">상품 옵션</button></div></article>`;
 }
 function comparisons(r,g){
  const connected=r.singles.filter(s=>s.lines.length);if(!connected.length)return '';
  return `<details class="shop-comparisons"><summary>연결된 상품 가격 비교</summary><p class="micro-note">같은 수량으로 연결된 상품만 비교해요. 전체 식재료 예상 금액과는 달라요.</p>${connected.map(s=>`<button data-a="shop-store" data-id="${s.store}"><span>${esc(storeName(s.store))}<small>${s.lines.length}가지 상품${s.complete?' · 전체 연결':''}</small></span><b>${won(s.complete&&s.total!==null?s.total:s.subtotal)}<small>${s.complete&&s.total!==null?'배송비 포함':'연결 상품 합계 · 배송비 별도'}</small></b></button>`).join('')}${r.split.complete&&r.split.total!==null?`<button data-a="shop-mode"><span>매장을 나눠 구매<small>${r.split.optimal?'배송비 포함 비교':'연결 상품 기준'}</small></span><b>${won(r.split.total)}</b></button>`:''}</details>`;
 }
 function view(){
  const r=result(),plan=r.current,g=host.groceries(),basket=presentation(plan),done=g.filter(x=>host.checked()[x.id]).length;
  return `<main class="screen shopping-screen commerce-screen"><div class="screen-title"><h1>장보기 목록</h1><p>${host.weekRange()} · ${g.length}가지 재료</p></div><div class="shop-stores">${stores().map(s=>`<button data-a="shop-store" data-id="${s}" class="${shop().mode==='single'&&(shop().singleStore||stores()[0])===s?'active':''}">${esc(storeName(s))}</button>`).join('')}</div><div class="shop-toolbar"><button data-a="shop-edit-stores">장볼 곳 변경</button><details class="shop-tools"><summary>${shop().mode==='split'?'매장 나눠 구매 중 · 옵션':'가격·배송 옵션'}</summary><button data-a="shop-settings">배송·멤버십 설정</button><button data-a="download">목록 파일로 저장</button><button data-a="shop-mode">매장을 나눠 구매</button><button data-a="shop-refresh" ${loading?'disabled':''}>${loading?'가격 업데이트 중…':'상품 가격 새로고침'}</button>${loadError?`<p class="micro-note">${esc(loadError)} 목록과 구매 링크는 계속 사용할 수 있어요.</p>`:''}${comparisons(r,g)}</details></div>${priceSummary(plan,basket)}${(state().prefs.allergies?.length||state().prefs.dislikes?.length)?'<p class="shop-label-note">알레르기·기피 재료는 식단에 반영했어요. 가공 상품은 구매 전 원재료와 교차접촉 표시를 살펴주세요.</p>':''}<div class="shopping-progress"><button data-a="extra-grocery">+ 재료 추가</button><span>${done} / ${g.length}가지 구매 완료</span><button data-a="copy">목록 복사</button></div><div class="grocery-rows">${basket.rows.map((x,i)=>`${i===0||g[i-1].category!==x.item.category?`<h2 class="grocery-category">${esc(x.item.category)}</h2>`:''}${itemRow(x)}`).join('')||'<div class="empty-copy">필요한 재료가 모두 냉장고에 있어요.</div>'}</div><p class="micro-note">냉장고에 있는 양은 이미 뺐어요. 기본 규격은 구매량을 정하기 위한 추천이며, 매장에서는 같은 총량에 맞춰 골라주세요.</p></main>${host.footer(g.length>done?'남은 '+(g.length-done)+'가지 구매하기 ↗':'장보기 목록 복사',g.length>done?'shop-buy':'copy')}${host.bottomNav()}`;
 }
 function picker(){
  const item=host.groceries().find(x=>x.id===pickId);if(!item)return;
  const rows=optionsFor(item,pickStore,offers(),state().prefs,shop());
  host.openDialog(`<h2>${esc(item.name)} 상품 선택</h2><p>${amount(item.need)}${item.unit} 추가로 필요해요.</p><div class="shop-stores">${stores().map(s=>`<button data-a="shop-picker-store" data-id="${s}" class="${s===pickStore?'active':''}">${esc(storeName(s))}</button>`).join('')}</div><a class="outline-button shop-search-link" href="${esc(searchUrl(pickStore,item.name))}" target="_blank" rel="noopener noreferrer">${esc(storeName(pickStore))}에서 상품 찾기 ↗</a><div class="shop-options">${rows.map(q=>`<section class="shop-option"><span class="shop-store-tag">${kind[q.offer.priceKind]} · ${q.offer.availability==='out-of-stock'?'품절':q.offer.availability==='in-stock'?'공개 재고 확인':'재고 미확인'}</span><h3>${esc(q.offer.name)}</h3><p>${amount(q.offer.packQuantity)}${q.offer.unit} × ${q.packs}팩 · ${won(q.cost)}</p><small>구매 후 ${amount(q.leftover)}${q.offer.unit} 남음 · ${time(q.offer.observedAt)} 확인</small><small>${esc(q.offer.context)}</small>${q.offer.minimumPacks>1||q.offer.multiplePacks>1?`<small>최소 ${q.offer.minimumPacks}팩 · ${q.offer.multiplePacks}팩 단위 주문</small>`:''}${q.offer.maximumPacks!==null?`<small>조회 시 주문 가능 수량 최대 ${q.offer.maximumPacks}팩</small>`:''}${q.offer.priceConditions?`<p class="shop-label">${esc(q.offer.priceConditions)}</p>`:''}${q.offer.priceKind==='coupon'&&q.offer.source==='retailer-page'&&shop().reviews['price_'+q.offer.id]!==priceConditionKey(q.offer)?`<label class="shop-review"><input type="checkbox" data-price-review="${q.offer.id}">이 상품의 쿠폰 적용 조건을 충족해요.</label>`:''}${q.offer.allergenText?`<p class="shop-label">상품 알레르기 표기: ${esc(q.offer.allergenText)}</p>`:'<p class="micro-note">상품의 성분표를 별도로 확인해주세요.</p>'}${q.risk.blocked.length?`<p class="shop-alert">${esc(q.reason)}</p>`:q.risk.needsReview?`<label class="shop-review"><input type="checkbox" data-review="${q.offer.id}">상품 페이지의 원재료·교차접촉 정보를 확인했어요.</label>`:''}${q.reason&&!['제품 성분 확인 필요','상품 쿠폰 조건 확인 필요'].includes(q.reason)?`<p class="shop-alert">${esc(q.reason)}</p>`:''}<div class="shop-row-actions">${q.offer.url?`<a href="${esc(q.offer.url)}" target="_blank" rel="noopener noreferrer">상품 보기 ↗</a>`:''}<button data-a="shop-choose" data-id="${q.offer.id}" ${q.risk.blocked.length||q.reason&&!['제품 성분 확인 필요','상품 쿠폰 조건 확인 필요'].includes(q.reason)?'disabled':''}>이 상품 선택</button><button data-a="shop-edit" data-id="${q.offer.id}">가격·옵션 재확인</button>${q.offer.source==='user-entered'?`<button data-a="shop-delete" data-id="${q.offer.id}">기록 삭제</button>`:''}</div></section>`).join('')||'<p class="empty-copy">이 매장은 위 검색 링크에서 상품을 골라 구매할 수 있어요.</p>'}</div><details class="shop-manual-tools"><summary>내 상품·가격 기록 (선택)</summary><button class="outline-button" data-a="shop-record" data-id="${item.id}" data-store="${pickStore}">직접 확인한 상품 기록</button></details><button class="link-button" data-a="shop-auto" data-id="${item.id}" data-store="${pickStore}">상품 선택 초기화</button>`);
 }
 function record(itemId,store,existing=null){
  const item=I[itemId],s=settings(store),o=existing||{};
  host.openDialog(`<h2>${esc(item.name)} 상품·가격</h2><p>${esc(storeName(store))}에서 확인한 상품을 기록해요.</p><form id="shop-offer-form" class="editor-form" data-ingredient="${itemId}" data-store="${store}" data-edit="${o.source==='user-entered'?o.id:''}"><label>상품명 · 옵션까지<input name="name" maxlength="180" value="${esc(o.name||'')}" required placeholder="브랜드 · 상품명 · 선택 옵션"></label><label>상품 링크 ${ONLINE_STORES.has(store)?'':'(선택)'}<input type="url" name="url" value="${esc(o.url||'')}" ${ONLINE_STORES.has(store)?'required':''} placeholder="https://"></label><div class="editor-pair"><label>1팩의 총수량 (${item.unit})<input type="number" name="quantity" min="0.001" max="100000" step="any" value="${esc(o.packQuantity||'')}" required></label><label>1팩 가격 (원)<input type="number" name="price" min="0" max="100000000" step="1" value="${o.price??''}" required></label></div><p class="micro-note">묶음 상품은 전체 수량을 입력하세요. 개수와 무게를 임의로 환산하지 않아요.</p><label>가격 조건<select name="priceKind">${Object.entries(kind).map(([v,n])=>`<option value="${v}" ${o.priceKind===v?'selected':''}>${n}</option>`).join('')}</select></label><label>판매 옵션 번호 (선택)<input name="optionId" maxlength="100" value="${esc(o.optionId||'')}" placeholder="같은 링크의 다른 규격 구분"></label><label>${ONLINE_STORES.has(store)?'배송지역·적용 조건':'매장·지점'}<input name="context" maxlength="180" value="${esc(o.context||(ONLINE_STORES.has(store)?s.region:s.branch))}" required></label><label>배송 묶음 · 판매자/배송방식<input name="deliveryGroup" maxlength="120" value="${esc(o.deliveryGroup||'store-default')}" required placeholder="예: 로켓프레시 / 판매자 이름"></label><label>상품에 적힌 알레르기·원재료 정보<textarea name="allergenText" rows="3" maxlength="2000">${esc(o.allergenText||'')}</textarea></label><label>현재 재고<select name="availability"><option value="in-stock">구매 가능 확인</option><option value="out-of-stock" ${o.availability==='out-of-stock'?'selected':''}>품절</option><option value="unknown" ${o.availability==='unknown'?'selected':''}>확인 못함</option></select></label><label class="shop-review"><input name="observed" type="checkbox" required>지금 해당 상품·옵션의 가격과 재고를 확인했어요.</label><button type="submit" class="primary-button">상품·가격 저장</button><p class="shop-form-error" role="alert"></p></form>`);
 }
 function storeSettings(){
  host.openDialog(`<h2>배송·멤버십 설정</h2><p>배송비는 판매자·배송 묶음마다 계산해요. 모르는 금액은 비워두세요.</p><form id="shop-settings-form" class="editor-form">${stores().map(store=>{const s=settings(store);return `<fieldset class="shop-settings-group"><legend>${esc(storeName(store))}</legend><label>구매 방식<select name="${store}-method"><option value="delivery" ${s.method==='delivery'?'selected':''}>배송</option><option value="pickup" ${s.method==='pickup'?'selected':''}>방문 구매</option></select></label><label>매장·지점<input name="${store}-branch" maxlength="100" value="${esc(s.branch)}"></label><label>배송지역 메모<input name="${store}-region" maxlength="100" value="${esc(s.region)}" placeholder="예: 서울 마포구"></label><label class="shop-review"><input type="checkbox" name="${store}-member" ${s.member?'checked':''}>해당 멤버십 가격을 적용받아요</label><label class="shop-review"><input type="checkbox" name="${store}-coupon" ${s.coupon?'checked':''}>등록한 쿠폰 가격의 조건을 충족해요</label><div class="editor-pair"><label>기본 배송비 (원)<input name="${store}-fee" type="number" min="0" max="100000000" value="${s.fee??''}"></label><label>무료 배송 기준 (원)<input name="${store}-freeOver" type="number" min="0" max="100000000" value="${s.freeOver??''}"></label></div><label>최소 주문 금액 (원)<input name="${store}-minimum" type="number" min="0" max="100000000" value="${s.minimum??''}"></label></fieldset>`;}).join('')}<button class="primary-button" type="submit">배송 조건 저장</button><p class="shop-form-error" role="alert"></p></form>`);
 }
 function buy(){
  const basket=presentation(),remaining=basket.rows.filter(r=>!host.checked()[r.item.id]);
  host.openDialog(`<h2>매장에서 장보기</h2><p>필요한 양에 맞춰 구매할 수 있도록 목록을 모았어요. 링크를 누르면 선택한 매장의 상품이나 검색 화면으로 이동해요.</p><button class="outline-button" data-a="shop-share">수량·구매 링크 한 번에 복사</button>${remaining.map(row=>{const {item,q}=row,l=q?.eligible?line(item.id):null,status=l?handoffState(l,shop(),state().week):null;return `<section class="shop-option"><span class="shop-store-tag">${esc(storeName(row.store))} · ${amount(item.need)}${item.unit} 필요</span><h3>${esc(q?.offer.name||item.name)}</h3><p>${amount(row.packQuantity)}${item.unit} × ${row.packs}팩 · ${row.source==='estimate'?'예상 ':''}${won(row.cost)}${row.source==='previous'?' · 이전 조회가':''}</p>${status?`<p class="shop-cart-status">${({pending:'쇼핑몰에서 이 수량으로 담아주세요.',opened:'쇼핑몰에서 담은 뒤 아래에 표시할 수 있어요.',confirmed:'담기 완료로 표시했어요',changed:'필요한 상품·수량이 달라졌어요. 장바구니의 수량도 바꿔주세요.'})[status]}</p>`:''}<div class="shop-row-actions"><a class="shop-purchase-link" href="${esc(row.url)}" target="_blank" rel="noopener noreferrer" ${l?`data-shop-open="${item.id}"`:''}>${row.directProduct?'상품 보기':'매장에서 찾기'} ↗</a>${l?`<button data-a="shop-confirm" data-id="${item.id}">${status==='confirmed'?'담기 표시 취소':'이 수량으로 담았어요'}</button>`:''}<button data-a="shop-purchased" data-id="${item.id}">구매 완료 ✓</button></div></section>`;}).join('')||'<p class="empty-copy">필요한 재료를 모두 구매했어요.</p>'}`);
 }
 async function load(remote=false){
  if(loading)return;loading=true;loadError='';if(host.visible())host.render();
  try{
   const url=remote&&host.native()?'https://migaryos.com/bapsang/app/retail-catalog.json':'retail-catalog.json';
   const response=await fetch(url+'?v='+Date.now(),{credentials:'omit',cache:'no-store',signal:timeoutSignal(15000)});if(!response.ok)throw new Error('상품 정보를 불러오지 못했어요. 저장한 기록은 유지돼요.');
   const data=await response.json();if(![1,2].includes(data.version)||!Array.isArray(data.offers)||data.offers.length>2000)throw new Error('상품 정보 형식을 확인하지 못했어요.');
   const parsed=data.offers.map(o=>validateOffer(o));if(new Set(parsed.map(o=>o.id)).size!==parsed.length)throw new Error('상품 정보가 중복됐어요.');catalog=parsed;loaded=true;
   
  }catch(e){loadError=e.message||'상품 정보를 불러오지 못했어요. 저장한 기록은 유지돼요.';}
  finally{loading=false;if(host.visible())host.render();}
  if(remote)await liveRefresh();
 }
 async function liveRefresh({silent=false}={}){
  if(loading)return;
  const needed=new Set(host.groceries().map(x=>x.id)),products=[...new Set(catalog.filter(o=>stores().includes(o.storeId)&&['kurly','homeplus','costco','ssg','lotte'].includes(o.storeId)&&needed.has(o.ingredientId)).map(o=>o.storeId+':'+o.productId))];
  if(!products.length){if(!silent)host.toast('선택한 매장의 상품 페이지에서 가격을 확인해주세요.');return;}
  loading=true;loadError='';if(host.visible())host.render();let index=0,success=0,failed=0;
  async function worker(){while(index<products.length){const token=products[index++],[provider,id]=token.split(':');try{
   const response=await fetch('https://bapsang-kitchen.mettl.chatgpt.site/api/retail/'+provider+'/'+id,{credentials:'omit',signal:timeoutSignal(18000)});if(!response.ok)throw new Error();const body=await response.json();if(![1,2].includes(body.version)||!Array.isArray(body.offers)||!body.offers.length)throw new Error();const rows=body.offers.map(o=>validateOffer(o));if(rows.some(o=>o.productId!==id||o.storeId!==provider))throw new Error();catalog=[...catalog.filter(o=>o.storeId!==provider||o.productId!==id),...rows];success++;if(host.visible())host.render();
  }catch{failed++;}}}
  await Promise.all(Array.from({length:Math.min(2,products.length)},()=>worker()));
  loading=false;if(failed)loadError=failed+'개 상품의 새 가격을 확인하지 못했어요. 이전 확인 시각을 확인해주세요.';if(host.visible())host.render();if(!silent)host.toast(success?success+'개 상품의 가격·재고를 확인했어요.':'새 가격을 확인하지 못했어요. 상품 페이지에서 확인해주세요.');
 }
 function textList(){const plan=current(),basket=presentation(plan);return `밥상 · 장보기 목록\n${host.weekRange()}\n\n`+basket.rows.map(row=>{const {item,q}=row;return `${host.checked()[item.id]?'✓':'□'} ${item.name}: ${amount(item.need)}${item.unit} 필요\n${storeName(row.store)} · ${q?row.q.offer.name:'기본 규격 기준'}\n${amount(row.packQuantity)}${item.unit} × ${row.packs}팩 · ${row.source==='estimate'?'예상 ':''}${won(row.cost)}${row.source==='previous'?' (이전 조회가)':''}\n${row.url}`;}).join('\n\n')+`\n\n전체 재료 예상 ${won(basket.subtotal)} · 배송비 별도\n실제 판매가와 배송 조건은 구매 매장에서 달라질 수 있어요.`;}
 async function action(el){
  const a=el.dataset.a,id=el.dataset.id;if(a==='shopping')setTimeout(()=>{if(catalog.some(o=>stores().includes(o.storeId)&&Date.now()-Date.parse(o.observedAt)>900000))liveRefresh({silent:true});},0);if(!a.startsWith('shop-'))return false;
  try{
   if(a==='shop-store'){shop().mode='single';shop().singleStore=id;await host.save();host.render();void liveRefresh({silent:true});}
   if(a==='shop-mode'){shop().mode='split';await host.save();host.render();}
   if(a==='shop-refresh')await load(true);
   if(a==='shop-settings')storeSettings();
   if(a==='shop-edit-stores')host.openDialog(`<h2>장볼 곳 변경</h2><p>최대 3곳을 골라 상품과 총액을 비교해요.</p><form id="shop-stores-form" class="editor-form">${STORES.map(s=>`<label class="shop-review"><input type="checkbox" name="stores" value="${s.id}" ${stores().includes(s.id)?'checked':''}>${esc(s.name)}</label>`).join('')}<button type="submit" class="primary-button">이 매장들에서 장보기</button><p class="shop-form-error" role="alert"></p></form>`);
   if(a==='shop-pick'){pickId=id;pickStore=line(id)?.offer.storeId||(stores().includes(shop().singleStore)?shop().singleStore:stores()[0]);picker();}
   if(a==='shop-picker-store'){pickStore=id;picker();}
   if(a==='shop-record')record(id,el.dataset.store);
   if(a==='shop-edit'){const o=offers().find(o=>o.id===id);record(o.ingredientId,o.storeId,o);}
   if(a==='shop-delete'){shop().offers=shop().offers.filter(o=>o.id!==id);for(const [key,value]of Object.entries(shop().selections))if(value===id)delete shop().selections[key];delete shop().reviews[id];await host.save();picker();host.render();}
   if(a==='shop-auto'){delete shop().selections[el.dataset.store+':'+id];await host.save();host.closeDialog();host.render();}
   if(a==='shop-choose'){
    const o=offers().find(o=>o.id===id);if(!o)throw new Error('상품을 다시 골라주세요.');const risk=offerRisk(o,state().prefs,shop());if(risk.blocked.length)throw new Error('피할 재료가 표기된 상품이에요. 다른 상품을 골라주세요.');
    if(o.priceKind==='coupon'&&o.source==='retailer-page'&&shop().reviews['price_'+o.id]!==priceConditionKey(o)){if(!document.querySelector(`[data-price-review="${id}"]`)?.checked)throw new Error('이 상품의 쿠폰 적용 조건을 확인해주세요.');shop().reviews['price_'+o.id]=priceConditionKey(o);}
    if(risk.needsReview){const check=document.querySelector(`[data-review="${id}"]`);if(!check?.checked)throw new Error('상품의 원재료·교차접촉 정보를 확인해주세요.');shop().reviews[id]=reviewKey(o,state().prefs);}
    const q=optionsFor(host.groceries().find(x=>x.id===o.ingredientId),o.storeId,offers(),state().prefs,shop()).find(q=>q.offer.id===id);if(!q.eligible)throw new Error(q.reason);
    shop().selections[o.storeId+':'+o.ingredientId]=id;await host.save();host.closeDialog();host.render();
   }
   if(a==='shop-buy')buy();
   if(a==='shop-purchased'){state().checked[state().week]??={};state().checked[state().week][id]=true;await host.save();host.render();buy();}
   if(a==='shop-confirm'){
    const l=line(id);if(!l)throw new Error('상품과 수량을 다시 확인해주세요.');shop().handoffs[state().week]??={};const key=lineKey(l);if(handoffState(l,shop(),state().week)==='confirmed')delete shop().handoffs[state().week][key];else shop().handoffs[state().week][key]={fingerprint:fingerprint(l),status:'confirmed',at:new Date().toISOString()};await host.save();host.render();buy();
   }
   if(a==='shop-share')await host.copy(textList());
  }catch(e){host.toast(e.message||'상품 정보를 확인해주세요.');}
  return true;
 }
 async function submit(form){
  if(!['shop-offer-form','shop-settings-form','shop-stores-form'].includes(form.id))return false;
  const d=new FormData(form);
  try{
   if(form.id==='shop-stores-form'){
    const checkedStores=d.getAll('stores'),selected=[...stores().filter(s=>checkedStores.includes(s)),...checkedStores.filter(s=>!stores().includes(s))];if(selected.length<1||selected.length>3)throw new Error('장볼 곳을 1~3곳 선택해주세요.');state().prefs.stores=selected;state().prefs.store=selected[0];shop().singleStore=selected[0];
   }else if(form.id==='shop-settings-form'){
    const candidate=structuredClone(shop());for(const store of stores()){const s={method:d.get(store+'-method'),branch:String(d.get(store+'-branch')),region:String(d.get(store+'-region')),member:d.has(store+'-member'),coupon:d.has(store+'-coupon')};for(const k of ['fee','freeOver','minimum'])s[k]=d.get(store+'-'+k)===''?null:Number(d.get(store+'-'+k));candidate.settings[store]=s;}state().shopping=validateShopping(candidate);
   }else{
    if(!d.has('observed'))throw new Error('상품의 현재 가격과 재고를 확인해주세요.');
    const ingredientId=form.dataset.ingredient,storeId=form.dataset.store,o=validateOffer({id:form.dataset.edit||'user-'+crypto.randomUUID(),ingredientId,storeId,name:String(d.get('name')),packQuantity:Number(d.get('quantity')),unit:I[ingredientId].unit,packLabel:'',price:Number(d.get('price')),priceKind:String(d.get('priceKind')),url:String(d.get('url')),optionId:String(d.get('optionId')),observedAt:new Date().toISOString(),availability:String(d.get('availability')),allergenText:String(d.get('allergenText')),context:String(d.get('context')),deliveryGroup:String(d.get('deliveryGroup'))},{manual:true});
    const candidate=structuredClone(shop());candidate.offers=candidate.offers.filter(x=>x.id!==o.id);candidate.offers.push(o);candidate.selections[storeId+':'+ingredientId]=o.id;state().shopping=validateShopping(candidate);
   }
   await host.save();host.closeDialog();host.render();host.toast('장보기 상품·조건을 저장했어요.');
  }catch(e){form.querySelector('.shop-form-error').textContent=e.message;}
  return true;
 }
 document.addEventListener('click',e=>{
  const link=e.target.closest('[data-shop-open]');if(!link)return;const l=line(link.dataset.shopOpen);if(!l)return;
  shop().handoffs[state().week]??={};if(handoffState(l,shop(),state().week)!=='confirmed')shop().handoffs[state().week][lineKey(l)]={fingerprint:fingerprint(l),status:'opened',at:new Date().toISOString()};host.save();
 });
 return {view,action,submit,textList,load,result};
}
