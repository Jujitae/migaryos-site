import {timeoutSignal} from './device.js';
import {INGREDIENTS as I,STORES} from './data.js';
import {won,amount} from './planner.js';
import {ONLINE_STORES,emptyShopping,validateOffer,validateShopping,storeName,searchUrl,optionsFor,comparePlans,offerRisk,restrictionKey,reviewKey,handoffState,handoffLines,lineKey,fingerprint} from './commerce.js';

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
 function settings(store){return shop().settings[store]||{branch:'',region:'',member:false,coupon:false,method:ONLINE_STORES.has(store)?'delivery':'pickup',fee:ONLINE_STORES.has(store)?null:0,freeOver:null,minimum:null,...(catalog.find(o=>o.storeId===store&&o.shippingRule)?.shippingRule||{})};}
 function priceSummary(plan){
  const missing=plan.missing.length,complete=plan.complete&&plan.total!==null,pending=!plan.lines.length&&host.groceries().length>0;
  return `<section class="shop-summary"><span>${complete?'배송비 포함 확인 금액':'확인된 상품 합계'}</span><strong>${pending?'가격 확인 필요':won(complete?plan.total:plan.subtotal)}</strong><p>${plan.lines.length} / ${host.groceries().length}가지 상품 연결${missing?' · '+missing+'가지 확인 필요':''}</p><div><span>상품 ${pending?'확인 필요':won(plan.subtotal)}</span><span>배송 ${pending||plan.shipping===null?'확인 필요':won(plan.shipping)}</span></div>${!plan.minimumMet?'<p class="shop-alert">일부 매장의 최소 주문 금액에 미달해요.</p>':''}${!complete?'<p class="micro-note">미연결 상품·미확인 배송비는 합계에 포함되지 않았어요.</p>':''}<small>확인 시점의 가격이에요. 배송지역·쿠폰·최종 결제 조건은 쇼핑몰에서 확인해주세요.</small></section>`;
 }
 function itemRow(item,plan){
  const chosen=plan.lines.find(l=>l.item.id===item.id),done=!!host.checked()[item.id],store=chosen?.offer.storeId||(stores().includes(shop().singleStore)?shop().singleStore:stores()[0]),q=chosen||optionsFor(item,store,offers(),state().prefs,shop()).find(q=>q.reason==='제품 성분 확인 필요');
  return `<article class="grocery-row commerce-row ${done?'checked':''}"><div class="shop-item-top"><span class="ingredient-emoji">${item.emoji}</span><div><b>${esc(item.name)}</b><span>필요 ${amount(item.quantity)}${item.unit} · 보유 ${amount(item.owned)}${item.unit}</span><small>추가로 ${amount(item.need)}${item.unit} 필요</small></div><button class="grocery-check shop-check" data-a="check" data-id="${item.id}" aria-label="${esc(item.name)} 구매 완료" aria-pressed="${done}">${done?'✓':''}</button></div>${q?`<div class="shop-product"><span class="shop-store-tag">${esc(storeName(q.offer.storeId))} · ${kind[q.offer.priceKind]}${chosen?'':' · 성분 확인 후 연결'}</span><b>${esc(q.offer.name)}</b><p>${amount(q.offer.packQuantity)}${q.offer.unit} × ${q.packs}팩 <strong>${won(q.cost)}</strong></p><small>구매 후 ${amount(q.leftover)}${q.offer.unit} 남아요 · ${time(q.offer.observedAt)} 확인</small><small>${esc(q.offer.context)}</small></div>`:'<p class="shop-unmatched">상품·규격·가격을 확인하면 구매 수량을 계산해요.</p>'}<div class="shop-row-actions"><button data-a="shop-pick" data-id="${item.id}">${q?'상품 변경':'상품 선택'}</button>${q?.offer.url?`<a href="${esc(q.offer.url)}" target="_blank" rel="noopener noreferrer" data-shop-open="${item.id}">상품 / 앱 열기 ↗</a>`:`<a href="${esc(searchUrl(store,item.name))}" target="_blank" rel="noopener noreferrer">${esc(storeName(store))}에서 찾기 ↗</a>`}<button data-a="shop-record" data-id="${item.id}" data-store="${store}">가격 직접 확인</button></div></article>`;
 }
 function view(){
  const r=result(),plan=r.current,g=host.groceries(),done=g.filter(x=>host.checked()[x.id]).length;
  return `<main class="screen shopping-screen commerce-screen"><div class="screen-title"><h1>장보기 목록</h1><p>${host.weekRange()} · ${g.length}가지 재료</p></div><div class="shop-stores">${stores().map(s=>`<button data-a="shop-store" data-id="${s}" class="${shop().mode==='single'&&(shop().singleStore||stores()[0])===s?'active':''}">${esc(storeName(s))}</button>`).join('')}<button data-a="shop-mode" class="${shop().mode==='split'?'active':''}">나눠 장보기</button></div><div class="shop-toolbar"><button data-a="shop-edit-stores">장볼 곳 변경</button><button data-a="shop-settings">배송·멤버십 설정</button><button data-a="shop-refresh" ${loading?'disabled':''}>${loading?'확인 중…':'상품 정보 새로고침'}</button></div>${priceSummary(plan)}${loadError?`<p class="shop-alert" role="status">${esc(loadError)}</p>`:''}${!loading&&loaded&&!catalog.length?'<p class="micro-note">불러온 상품이 없어요. 쇼핑몰에서 확인한 상품·가격을 직접 등록할 수 있어요.</p>':''}${loading?'<p class="micro-note" role="status">연결할 수 있는 상품을 확인하고 있어요.</p>':''}<details class="shop-comparisons"><summary>매장별 총액 비교</summary>${r.singles.map(s=>`<button data-a="shop-store" data-id="${s.store}"><span>${esc(storeName(s.store))}<small>${s.lines.length}/${g.length}가지 연결${s.minimumMet?'':' · 최소주문 미달'}</small></span><b>${s.complete&&s.total!==null?won(s.total):'확인 필요'}</b></button>`).join('')}<button data-a="shop-mode"><span>${r.split.optimal?'배송비 포함 낮은 조합':r.split.complete?'배송비 고려 조합':'연결 가능한 상품 조합'}<small>${r.split.lines.length}/${g.length}가지 연결 · 확인된 상품 중 비교</small></span><b>${r.split.complete&&r.split.total!==null?won(r.split.total):'확인 필요'}</b></button></details><div class="shopping-progress"><button data-a="extra-grocery">+ 재료 추가</button><span>${done} / ${g.length}가지 완료</span><button data-a="download">파일로 저장</button></div><div class="grocery-rows">${g.map((x,i)=>`${i===0||g[i-1].category!==x.category?`<h2 class="grocery-category">${esc(x.category)}</h2>`:''}${itemRow(x,plan)}`).join('')||'<div class="empty-copy">필요한 재료가 모두 냉장고에 있어요.</div>'}</div>${plan.lines.length?`<button class="primary-button shop-buy" data-a="shop-buy">상품 확인하고 담기 · ${handoffLines(plan,shop(),state().week,host.checked()).length}가지 남음</button>`:''}<p class="micro-note">필요량을 합산하고 냉장고 보유량을 차감했어요. 상품은 포장 단위로 계산해요.<br>알레르기·기피 재료가 있으면 대체 상품의 성분도 확인해주세요. 가격 기록은 6시간이 지나면 다시 확인해야 비교에 사용돼요.</p></main>${host.footer('장보기 목록 복사','copy')}${host.bottomNav()}`;
 }
 function picker(){
  const item=host.groceries().find(x=>x.id===pickId);if(!item)return;
  const rows=optionsFor(item,pickStore,offers(),state().prefs,shop());
  host.openDialog(`<h2>${esc(item.name)} 상품 선택</h2><p>${amount(item.need)}${item.unit} 추가로 필요해요.</p><div class="shop-stores">${stores().map(s=>`<button data-a="shop-picker-store" data-id="${s}" class="${s===pickStore?'active':''}">${esc(storeName(s))}</button>`).join('')}</div><a class="outline-button shop-search-link" href="${esc(searchUrl(pickStore,item.name))}" target="_blank" rel="noopener noreferrer">${esc(storeName(pickStore))}에서 상품 찾기 ↗</a><div class="shop-options">${rows.map(q=>`<section class="shop-option"><span class="shop-store-tag">${kind[q.offer.priceKind]} · ${q.offer.availability==='out-of-stock'?'품절':q.offer.availability==='in-stock'?'공개 재고 확인':'재고 미확인'}</span><h3>${esc(q.offer.name)}</h3><p>${amount(q.offer.packQuantity)}${q.offer.unit} × ${q.packs}팩 · ${won(q.cost)}</p><small>구매 후 ${amount(q.leftover)}${q.offer.unit} 남음 · ${time(q.offer.observedAt)} 확인</small><small>${esc(q.offer.context)}</small>${q.offer.allergenText?`<p class="shop-label">상품 알레르기 표기: ${esc(q.offer.allergenText)}</p>`:'<p class="micro-note">상품의 성분표를 별도로 확인해주세요.</p>'}${q.risk.blocked.length?`<p class="shop-alert">${esc(q.reason)}</p>`:q.risk.needsReview?`<label class="shop-review"><input type="checkbox" data-review="${q.offer.id}">상품 페이지의 원재료·교차접촉 정보를 확인했어요.</label>`:''}${q.reason&&q.reason!=='제품 성분 확인 필요'?`<p class="shop-alert">${esc(q.reason)}</p>`:''}<div class="shop-row-actions">${q.offer.url?`<a href="${esc(q.offer.url)}" target="_blank" rel="noopener noreferrer">상품 보기 ↗</a>`:''}<button data-a="shop-choose" data-id="${q.offer.id}" ${q.risk.blocked.length||q.reason&&q.reason!=='제품 성분 확인 필요'?'disabled':''}>이 상품 선택</button><button data-a="shop-edit" data-id="${q.offer.id}">가격·옵션 재확인</button>${q.offer.source==='user-entered'?`<button data-a="shop-delete" data-id="${q.offer.id}">기록 삭제</button>`:''}</div></section>`).join('')||'<p class="empty-copy">확인된 상품이 아직 없어요.<br>구매할 상품과 가격을 등록해주세요.</p>'}</div><button class="primary-button" data-a="shop-record" data-id="${item.id}" data-store="${pickStore}">확인한 상품·가격 등록</button><button class="link-button" data-a="shop-auto" data-id="${item.id}" data-store="${pickStore}">상품 선택 초기화</button>`);
 }
 function record(itemId,store,existing=null){
  const item=I[itemId],s=settings(store),o=existing||{};
  host.openDialog(`<h2>${esc(item.name)} 상품·가격</h2><p>${esc(storeName(store))}에서 확인한 상품을 기록해요.</p><form id="shop-offer-form" class="editor-form" data-ingredient="${itemId}" data-store="${store}" data-edit="${o.source==='user-entered'?o.id:''}"><label>상품명 · 옵션까지<input name="name" maxlength="180" value="${esc(o.name||'')}" required placeholder="브랜드 · 상품명 · 선택 옵션"></label><label>상품 링크 ${ONLINE_STORES.has(store)?'':'(선택)'}<input type="url" name="url" value="${esc(o.url||'')}" ${ONLINE_STORES.has(store)?'required':''} placeholder="https://"></label><div class="editor-pair"><label>1팩의 총수량 (${item.unit})<input type="number" name="quantity" min="0.001" max="100000" step="any" value="${esc(o.packQuantity||'')}" required></label><label>1팩 가격 (원)<input type="number" name="price" min="0" max="100000000" step="1" value="${o.price??''}" required></label></div><p class="micro-note">묶음 상품은 전체 수량을 입력하세요. 개수와 무게를 임의로 환산하지 않아요.</p><label>가격 조건<select name="priceKind">${Object.entries(kind).map(([v,n])=>`<option value="${v}" ${o.priceKind===v?'selected':''}>${n}</option>`).join('')}</select></label><label>판매 옵션 번호 (선택)<input name="optionId" maxlength="100" value="${esc(o.optionId||'')}" placeholder="같은 링크의 다른 규격 구분"></label><label>${ONLINE_STORES.has(store)?'배송지역·적용 조건':'매장·지점'}<input name="context" maxlength="180" value="${esc(o.context||(ONLINE_STORES.has(store)?s.region:s.branch))}" required></label><label>배송 묶음 · 판매자/배송방식<input name="deliveryGroup" maxlength="120" value="${esc(o.deliveryGroup||'store-default')}" required placeholder="예: 로켓프레시 / 판매자 이름"></label><label>상품에 적힌 알레르기·원재료 정보<textarea name="allergenText" rows="3" maxlength="2000">${esc(o.allergenText||'')}</textarea></label><label>현재 재고<select name="availability"><option value="in-stock">구매 가능 확인</option><option value="out-of-stock" ${o.availability==='out-of-stock'?'selected':''}>품절</option><option value="unknown" ${o.availability==='unknown'?'selected':''}>확인 못함</option></select></label><label class="shop-review"><input name="observed" type="checkbox" required>지금 해당 상품·옵션의 가격과 재고를 확인했어요.</label><button type="submit" class="primary-button">상품·가격 저장</button><p class="shop-form-error" role="alert"></p></form>`);
 }
 function storeSettings(){
  host.openDialog(`<h2>배송·멤버십 설정</h2><p>배송비는 판매자·배송 묶음마다 계산해요. 모르는 금액은 비워두세요.</p><form id="shop-settings-form" class="editor-form">${stores().map(store=>{const s=settings(store);return `<fieldset class="shop-settings-group"><legend>${esc(storeName(store))}</legend><label>구매 방식<select name="${store}-method"><option value="delivery" ${s.method==='delivery'?'selected':''}>배송</option><option value="pickup" ${s.method==='pickup'?'selected':''}>방문 구매</option></select></label><label>매장·지점<input name="${store}-branch" maxlength="100" value="${esc(s.branch)}"></label><label>배송지역 메모<input name="${store}-region" maxlength="100" value="${esc(s.region)}" placeholder="예: 서울 마포구"></label><label class="shop-review"><input type="checkbox" name="${store}-member" ${s.member?'checked':''}>해당 멤버십 가격을 적용받아요</label><label class="shop-review"><input type="checkbox" name="${store}-coupon" ${s.coupon?'checked':''}>등록한 쿠폰 가격의 조건을 충족해요</label><div class="editor-pair"><label>기본 배송비 (원)<input name="${store}-fee" type="number" min="0" max="100000000" value="${s.fee??''}"></label><label>무료 배송 기준 (원)<input name="${store}-freeOver" type="number" min="0" max="100000000" value="${s.freeOver??''}"></label></div><label>최소 주문 금액 (원)<input name="${store}-minimum" type="number" min="0" max="100000000" value="${s.minimum??''}"></label></fieldset>`;}).join('')}<button class="primary-button" type="submit">배송 조건 저장</button><p class="shop-form-error" role="alert"></p></form>`);
 }
 function buy(){
  const plan=current();
  host.openDialog(`<h2>상품 확인하고 담기</h2><p>각 상품을 쇼핑몰에서 담은 뒤 완료 표시해주세요. 기존 장바구니의 상품·수량은 쇼핑몰에서 확인할 수 있어요.</p>${!plan.complete?`<p class="shop-alert">${plan.missing.length}가지 재료는 상품 확인이 더 필요해요.</p>`:''}${plan.lines.filter(l=>!host.checked()[l.item.id]).map(l=>{const status=handoffState(l,shop(),state().week);return `<section class="shop-option"><span class="shop-store-tag">${esc(storeName(l.offer.storeId))}</span><h3>${esc(l.offer.name)}</h3><p>${l.packs}팩 · ${won(l.cost)}</p><p class="shop-cart-status">${({pending:'아직 담지 않았어요',opened:'상품을 열었어요 · 담기 여부를 확인해주세요',confirmed:'담기 완료로 표시했어요',changed:'필요 수량·상품이 바뀌었어요. 기존 장바구니를 확인해주세요.'})[status]}</p><div class="shop-row-actions">${l.offer.url?`<a href="${esc(l.offer.url)}" target="_blank" rel="noopener noreferrer" data-shop-open="${l.item.id}">상품 / 앱 열기 ↗</a>`:''}<button data-a="shop-confirm" data-id="${l.item.id}">${status==='confirmed'?'완료 표시 취소':'이 수량으로 담았어요'}</button></div></section>`;}).join('')}<button class="primary-button" data-a="shop-share">상품·수량·링크 목록 복사</button>`);
 }
 async function load(remote=false){
  if(loading)return;loading=true;loadError='';if(host.visible())host.render();
  try{
   const url=remote&&host.native()?'https://migaryos.com/bapsang/app/retail-catalog.json':'retail-catalog.json';
   const response=await fetch(url+'?v='+Date.now(),{credentials:'omit',cache:'no-store',signal:timeoutSignal(15000)});if(!response.ok)throw new Error('상품 정보를 불러오지 못했어요. 저장한 기록은 유지돼요.');
   const data=await response.json();if(data.version!==1||!Array.isArray(data.offers)||data.offers.length>2000)throw new Error('상품 정보 형식을 확인하지 못했어요.');
   const parsed=data.offers.map(o=>validateOffer(o));if(new Set(parsed.map(o=>o.id)).size!==parsed.length)throw new Error('상품 정보가 중복됐어요.');catalog=parsed;loaded=true;
   
  }catch(e){loadError=e.message||'상품 정보를 불러오지 못했어요. 저장한 기록은 유지돼요.';}
  finally{loading=false;if(host.visible())host.render();}
  if(remote)await liveRefresh();
 }
 async function liveRefresh({silent=false}={}){
  if(loading)return;
  const needed=new Set(host.groceries().map(x=>x.id)),products=[...new Set(catalog.filter(o=>stores().includes(o.storeId)&&o.storeId==='kurly'&&needed.has(o.ingredientId)).map(o=>o.productId))];
  if(!products.length){if(!silent)host.toast('선택한 매장의 상품 페이지에서 가격을 확인해주세요.');return;}
  loading=true;loadError='';if(host.visible())host.render();let index=0,success=0,failed=0;
  async function worker(){while(index<products.length){const id=products[index++];try{
   const response=await fetch('https://bapsang-kitchen.mettl.chatgpt.site/api/retail/kurly/'+id,{credentials:'omit',signal:timeoutSignal(18000)});if(!response.ok)throw new Error();const body=await response.json();if(body.version!==1||!Array.isArray(body.offers)||!body.offers.length)throw new Error();const rows=body.offers.map(o=>validateOffer(o));if(rows.some(o=>o.productId!==id||o.storeId!=='kurly'))throw new Error();catalog=[...catalog.filter(o=>o.storeId!=='kurly'||o.productId!==id),...rows];success++;
  }catch{failed++;}}}
  await Promise.all(Array.from({length:Math.min(4,products.length)},()=>worker()));
  loading=false;if(failed)loadError=failed+'개 상품의 새 가격을 확인하지 못했어요. 이전 확인 시각을 확인해주세요.';if(host.visible())host.render();if(!silent)host.toast(success?success+'개 상품의 가격·재고를 확인했어요.':'새 가격을 확인하지 못했어요. 상품 페이지에서 확인해주세요.');
 }
 function textList(){const p=current();return `밥상 · 장보기 목록\n${host.weekRange()}\n\n`+host.groceries().map(item=>{const q=p.lines.find(l=>l.item.id===item.id);return `${host.checked()[item.id]?'✓':'□'} ${item.name}: ${amount(item.need)}${item.unit} 필요\n`+(q?`${storeName(q.offer.storeId)} · ${q.offer.name}\n${amount(q.offer.packQuantity)}${q.offer.unit} × ${q.packs}팩 · ${won(q.cost)} (${kind[q.offer.priceKind]})\n남음 ${amount(q.leftover)}${q.offer.unit} · ${time(q.offer.observedAt)} 확인\n${q.offer.url}`:'상품·가격 확인 필요');}).join('\n\n')+`\n\n상품 합계 ${won(p.subtotal)}\n배송비 ${p.shipping===null?'확인 필요':won(p.shipping)}\n${p.complete&&p.total!==null?'배송비 포함 '+won(p.total):'미확인 항목이 있어 전체 결제 금액은 아직 확정되지 않았어요.'}`;}
 async function action(el){
  const a=el.dataset.a,id=el.dataset.id;if(a==='shopping')setTimeout(()=>{if(catalog.some(o=>stores().includes(o.storeId)&&Date.now()-Date.parse(o.observedAt)>900000))liveRefresh({silent:true});},0);if(!a.startsWith('shop-'))return false;
  try{
   if(a==='shop-store'){shop().mode='single';shop().singleStore=id;await host.save();host.render();}
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
    if(risk.needsReview){const check=document.querySelector(`[data-review="${id}"]`);if(!check?.checked)throw new Error('상품의 원재료·교차접촉 정보를 확인해주세요.');shop().reviews[id]=reviewKey(o,state().prefs);}
    const q=optionsFor(host.groceries().find(x=>x.id===o.ingredientId),o.storeId,offers(),state().prefs,shop()).find(q=>q.offer.id===id);if(!q.eligible)throw new Error(q.reason);
    shop().selections[o.storeId+':'+o.ingredientId]=id;await host.save();host.closeDialog();host.render();
   }
   if(a==='shop-buy')buy();
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
