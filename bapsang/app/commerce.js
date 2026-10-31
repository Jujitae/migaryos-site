import {INGREDIENTS,STORES,ALLERGY_OPTIONS,DISLIKE_OPTIONS} from './data.js';

const ids=new Set(STORES.map(s=>s.id)),plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
export const ONLINE_STORES=new Set(['coupang','kurly','ssg']);
const domains={coupang:['coupang.com'],kurly:['kurly.com'],ssg:['ssg.com'],emart:['ssg.com','emart.com'],nobrand:['ssg.com','emart.com'],traders:['ssg.com','emart.com'],everyday:['ssg.com','emart.com'],ssgfood:['ssg.com','shinsegae.com'],homeplus:['homeplus.co.kr'],megafood:['homeplus.co.kr'],lotte:['lottemart.com','lotteon.com'],maxx:['lottemart.com','lotteon.com'],costco:['costco.co.kr'],gsfresh:['gsretail.com','gsshop.com'],orga:['orga.co.kr','pulmuone.com'],bmart:['baemin.com','baemin.co.kr'],cu:['bgfretail.com','pocketcu.co.kr'],gs25:['gsretail.com'],seven:['7-eleven.co.kr'],emart24:['emart24.co.kr'],market:[]};
const fail=message=>{throw new Error(message);};
const finite=(x,min=0,max=100000000)=>typeof x==='number'&&Number.isFinite(x)&&x>=min&&x<=max;
const safeKey=x=>typeof x==='string'&&/^[a-zA-Z0-9_-]{1,140}$/.test(x)&&!['__proto__','constructor','prototype'].includes(x);
const text=(x,n=200)=>typeof x==='string'&&x.length<=n;
const date=x=>text(x,50)&&Number.isFinite(Date.parse(x))&&Date.parse(x)<=Date.now()+300000;
export function storeName(id){return STORES.find(s=>s.id===id)?.name||id;}
export function productUrl(value,store){
 if(!value)return '';
 let u;try{u=new URL(value);}catch{fail('상품의 전체 https 링크를 입력해주세요.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!(domains[store]||[]).some(d=>u.hostname===d||u.hostname.endsWith('.'+d)))fail('선택한 매장의 공식 https 상품 링크를 입력해주세요.');
 u.hash='';return u.href;
}
export function searchUrl(store,name){
 const q=encodeURIComponent(name);
 if(store==='coupang')return 'https://www.coupang.com/np/search?q='+q;
 if(store==='kurly')return 'https://www.kurly.com/search?sword='+q;
 if(store==='ssg')return 'https://www.ssg.com/search.ssg?query='+q;
 if(store==='costco')return 'https://www.costco.co.kr/search?text='+q;
 return 'https://search.naver.com/search.naver?query='+encodeURIComponent(storeName(store)+' '+name);
}
export function emptyShopping(){return {version:1,offers:[],selections:{},reviews:{},settings:{},handoffs:{},mode:'single',singleStore:null};}
export function validateOffer(o,{manual=false}={}){
 if(!plain(o)||!safeKey(o.id)||!ids.has(o.storeId)||!Object.hasOwn(INGREDIENTS,o.ingredientId))fail('상품과 매장을 확인해주세요.');
 if(!text(o.name,180)||!o.name.trim()||!finite(o.packQuantity,.001,100000)||o.unit!==INGREDIENTS[o.ingredientId].unit)fail('상품명과 재료 단위에 맞는 포장 수량을 입력해주세요.');
 if(!finite(o.price)||!Number.isInteger(o.price)||!['general','member','coupon'].includes(o.priceKind))fail('상품 가격과 적용 조건을 확인해주세요.');
 if(!date(o.observedAt)||!['in-stock','out-of-stock','unknown'].includes(o.availability))fail('가격 확인 시각과 재고를 확인해주세요.');
 if(!text(o.priceConditions||'',500))fail('가격 적용 조건을 확인해주세요.');
 for(const k of ['minimumPacks','multiplePacks','maximumPacks'])if(o[k]!==undefined&&o[k]!==null&&(!finite(o[k],k==='maximumPacks'?0:1,100000)||!Number.isInteger(o[k])))fail('상품 구매 수량 제한을 확인해주세요.');
 if(!text(o.allergenText||'',2000)||!text(o.context||'',180)||!text(o.deliveryGroup||'',120)||!text(o.optionId||'',100)||!text(o.productId||'',100)||!text(o.packLabel||'',140)||!text(o.brand||'',100))fail('상품 정보의 길이를 확인해주세요.');
 const url=productUrl(o.url,o.storeId);if(ONLINE_STORES.has(o.storeId)&&!url)fail('온라인 상품은 구매 링크가 필요해요.');
 if(!ONLINE_STORES.has(o.storeId)&&!o.context?.trim())fail('매장명·지점을 입력해주세요.');
 return {minimumPacks:o.minimumPacks??1,multiplePacks:o.multiplePacks??1,maximumPacks:o.maximumPacks??null,priceConditions:o.priceConditions||'',id:o.id,storeId:o.storeId,ingredientId:o.ingredientId,name:o.name.trim(),brand:o.brand||'',packQuantity:o.packQuantity,unit:o.unit,packLabel:o.packLabel||'',price:o.price,priceKind:o.priceKind,url,observedAt:o.observedAt,availability:o.availability,allergenText:o.allergenText||'',context:o.context||'',deliveryGroup:o.deliveryGroup||'store-default',optionId:o.optionId||'',productId:o.productId||'',source:manual?'user-entered':o.source==='retailer-page'?'retailer-page':'user-entered',shippingRule:!manual&&plain(o.shippingRule)?validateRule(o.shippingRule):null};
}
export function validateRule(r){
 const out={};for(const k of ['fee','freeOver','minimum']){if(r[k]!==null&&r[k]!==undefined&&(!finite(r[k])||!Number.isInteger(r[k])))fail('배송비·최소 주문 금액을 확인해주세요.');out[k]=r[k]??null;}return out;
}
export function validateShopping(value){
 if(value===undefined)return emptyShopping();
 if(!plain(value)||value.version!==1||!Array.isArray(value.offers)||value.offers.length>500)fail('장보기 상품 데이터가 올바르지 않아요.');
 const out=emptyShopping();out.offers=value.offers.map(o=>validateOffer(o,{manual:true}));if(new Set(out.offers.map(o=>o.id)).size!==out.offers.length)fail('상품이 중복됐어요.');
 for(const key of ['selections','reviews','settings','handoffs'])if(!plain(value[key]||{}))fail('장보기 설정 형식을 확인해주세요.');
 for(const [key,id]of Object.entries(value.selections||{})){
  const [store,ingredient,...rest]=key.split(':');if(rest.length||!ids.has(store)||!Object.hasOwn(INGREDIENTS,ingredient)||!safeKey(id))fail('선택 상품이 올바르지 않아요.');out.selections[key]=id;
 }
 if(Object.keys(value.reviews||{}).length>1000)fail('제품 확인 기록이 너무 많아요.');
 for(const [key,v]of Object.entries(value.reviews||{})){if(!safeKey(key)||!text(v,8000))fail('제품 확인 기록을 확인해주세요.');out.reviews[key]=v;}
 for(const [store,s]of Object.entries(value.settings||{})){
  if(!ids.has(store)||!plain(s)||!text(s.branch||'',100)||!text(s.region||'',100)||s.member!==undefined&&typeof s.member!=='boolean'||s.coupon!==undefined&&typeof s.coupon!=='boolean'||!['delivery','pickup'].includes(s.method))fail('매장·배송 설정을 확인해주세요.');
  out.settings[store]={...validateRule(s),branch:s.branch||'',region:s.region||'',method:s.method,member:!!s.member,coupon:!!s.coupon};
 }
 if(Object.keys(value.handoffs||{}).length>260)fail('장보기 진행 기록이 너무 많아요.');
 for(const [week,lines]of Object.entries(value.handoffs||{})){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(week)||!plain(lines)||Object.keys(lines).length>500)fail('장보기 진행 기록을 확인해주세요.');out.handoffs[week]={};
  for(const [key,r]of Object.entries(lines)){if(!ids.has(key.split(':')[0])||!Object.hasOwn(INGREDIENTS,key.split(':')[1])||key.split(':').length!==2||!plain(r)||!text(r.fingerprint,500)||!['opened','confirmed'].includes(r.status)||!date(r.at))fail('상품 담기 기록을 확인해주세요.');out.handoffs[week][key]={fingerprint:r.fingerprint,status:r.status,at:r.at};}
 }
 if(!['single','split'].includes(value.mode||'single')||value.singleStore!==null&&value.singleStore!==undefined&&!ids.has(value.singleStore))fail('장보기 방식을 확인해주세요.');out.mode=value.mode||'single';out.singleStore=value.singleStore||null;return out;
}
export function restrictionKey(p){return JSON.stringify({allergies:[...(p.allergies||[])].sort(),dislikes:[...(p.dislikes||[])].sort(),diet:p.diet||'none'});}
export function reviewKey(o,p){return JSON.stringify([restrictionKey(p),o.name,o.packQuantity,o.unit,o.allergenText]);}
export function offerRisk(o,p,shopping){
 const raw=(o.allergenText+' '+o.name).toLowerCase(),blocked=[],ingredientIds=new Set();
 const mentions=w=>w.length>1?raw.includes(w.toLowerCase()):new RegExp('(^|[^가-힣a-z])'+w+'(?=함유|포함|$|[^가-힣a-z])').test(raw);
 const groups={tree_nut:['아몬드','호두','캐슈','피스타치오','헤이즐넛','마카다미아','피칸','브라질너트'],fish:['고등어','연어','참치','명태','꽁치','멸치','갈치','삼치','정어리','가자미'],shellfish:['새우','꽃게','대게','홍게','게살','게장','오징어','문어','낙지','바지락','홍합','굴소스','생굴','가리비','조개','갑각류','연체류','소라','전복']};
 for(const id of p.allergies||[])if(groups[id]?.some(mentions))blocked.push(ALLERGY_OPTIONS.find(a=>a.id===id)?.label||id);
 function visit(id){if(ingredientIds.has(id))return;ingredientIds.add(id);for(const x of INGREDIENTS[id]?.contains||[])visit(x);}visit(o.ingredientId);
 const ingredientTags=[...ingredientIds].flatMap(id=>INGREDIENTS[id]?.allergens||[]);
 for(const id of p.allergies||[])if(ingredientTags.includes(id))blocked.push(ALLERGY_OPTIONS.find(a=>a.id===id)?.label||id);
 for(const id of p.dislikes||[]){const d=DISLIKE_OPTIONS.find(x=>x.id===id);if(d?.ingredients.some(i=>ingredientIds.has(i)))blocked.push(d.label);}
 for(const id of p.allergies||[]){const a=ALLERGY_OPTIONS.find(x=>x.id===id);if(a&&[a.label,...(a.aliases||[])].some(mentions))blocked.push(a.label);}
 for(const id of p.dislikes||[]){const a=DISLIKE_OPTIONS.find(x=>x.id===id);if(a&&[a.label,...(a.aliases||[])].some(mentions))blocked.push(a.label);}
 const dietary=p.diet==='dairyfree'?['우유','유제품']:p.diet==='glutenfree'?['밀 함유']:p.diet==='vegan'?['우유','달걀','계란','쇠고기','소고기','돼지고기','닭고기','새우','멸치']:[];
 for(const word of dietary)if(raw.includes(word))blocked.push(word);
 const needsReview=!!((p.allergies||[]).length||(p.dislikes||[]).length||['vegan','vegetarian','pescatarian','dairyfree','glutenfree'].includes(p.diet));
 return {blocked:[...new Set(blocked)],needsReview:needsReview&&shopping.reviews[o.id]!==reviewKey(o,p)};
}
export function priceConditionKey(o){return JSON.stringify([o.id,o.price,o.priceConditions||'',o.minimumPacks||1,o.multiplePacks||1]);}
export function quote(o,need,p,shopping,now=Date.now()){
 const settings=shopping.settings[o.storeId]||{},risk=offerRisk(o,p,shopping),age=now-Date.parse(o.observedAt),packs=need>0?Math.ceil(Math.max(o.minimumPacks||1,Math.ceil((need-1e-7)/o.packQuantity))/(o.multiplePacks||1))*(o.multiplePacks||1):0;
 let reason='';if(o.availability!=='in-stock')reason=o.availability==='out-of-stock'?'품절':'재고 확인 필요';
 else if(o.maximumPacks!==undefined&&o.maximumPacks!==null&&packs>o.maximumPacks)reason='필요 수량만큼 재고 없음';
 else if(age>6*3600000||age< -300000)reason='가격 다시 확인';
 else if(o.priceKind==='member'&&!settings.member)reason='멤버십 적용 확인 필요';
 else if(o.priceKind==='coupon'&&(o.source==='retailer-page'?shopping.reviews['price_'+o.id]!==priceConditionKey(o):!settings.coupon))reason=o.source==='retailer-page'?'상품 쿠폰 조건 확인 필요':'쿠폰 적용 확인 필요';
 else if(risk.blocked.length)reason='피할 재료: '+risk.blocked.join(', ');
 else if(risk.needsReview)reason='제품 성분 확인 필요';
 return {offer:o,packs,purchased:packs*o.packQuantity,leftover:Math.max(0,packs*o.packQuantity-need),cost:packs*o.price,need,eligible:!reason,reason,risk};
}
export function optionsFor(item,store,offers,p,shopping,now){return offers.filter(o=>o.storeId===store&&o.ingredientId===item.id).map(o=>quote(o,item.need,p,shopping,now)).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||a.cost-b.cost||a.leftover-b.leftover);}
export function candidatesFor(item,store,offers,p,shopping,now){
 const selected=shopping.selections[store+':'+item.id];return optionsFor(item,store,offers,p,shopping,now).filter(q=>q.eligible&&(!selected||q.offer.id===selected));
}
export function totals(lines,shopping){
 const groups=new Map();for(const line of lines){const o=line.offer,key=o.storeId+':'+o.deliveryGroup;let g=groups.get(key);if(!g){g={key,storeId:o.storeId,subtotal:0,lines:[],rule:shopping.settings[o.storeId]||o.shippingRule||{method:ONLINE_STORES.has(o.storeId)?'delivery':'pickup',fee:null,freeOver:null,minimum:null}};groups.set(key,g);}g.subtotal+=line.cost;g.lines.push(line);}
 let subtotal=0,shipping=0,shippingKnown=true,minimumMet=true;
 for(const g of groups.values()){
  const rule=g.rule;g.shipping=rule.method==='pickup'?0:rule.freeOver!==null&&rule.freeOver!==undefined&&g.subtotal>=rule.freeOver?0:rule.fee;
  if(g.shipping===undefined||g.shipping===null){g.shipping=null;shippingKnown=false;}else shipping+=g.shipping;
  g.minimumMet=rule.minimum===null||rule.minimum===undefined||g.subtotal>=rule.minimum;if(!g.minimumMet)minimumMet=false;subtotal+=g.subtotal;
 }
 return {groups:[...groups.values()],subtotal,shipping:shippingKnown?shipping:null,total:shippingKnown&&minimumMet?subtotal+shipping:null,shippingKnown,minimumMet};
}
export function comparePlans(items,stores,offers,p,shopping,{now=Date.now(),maxNodes=40000}={}){
 const choices=items.map(item=>({item,byStore:Object.fromEntries(stores.map(s=>[s,candidatesFor(item,s,offers,p,shopping,now)]))}));
 const plan=(lines,missing=[])=>({...totals(lines,shopping),lines,missing,complete:missing.length===0});
 const singles=stores.map(store=>{const lines=[],missing=[];for(const c of choices){const q=c.byStore[store][0];if(q)lines.push({...q,item:c.item});else missing.push(c.item.id);}return {store,...plan(lines,missing)};});
 const available=choices.map(c=>({item:c.item,options:stores.flatMap(s=>c.byStore[s].map(q=>({...q,item:c.item}))).sort((a,b)=>a.cost-b.cost)}));
 const missing=available.filter(c=>!c.options.length).map(c=>c.item.id),work=available.filter(c=>c.options.length).sort((a,b)=>a.options.length-b.options.length||b.options[0].cost-a.options[0].cost);
 let best=plan(work.map(c=>c.options[0]),missing),nodes=0,limited=false;
 const score=v=>v.complete&&v.minimumMet&&v.total!==null?v.total:Infinity;
 for(const s of singles)if(score(s)<score(best))best=s;
 const lower=Array(work.length+1).fill(0);for(let i=work.length-1;i>=0;i--)lower[i]=lower[i+1]+work[i].options[0].cost;
 function visit(i,lines,cost){
  if(++nodes>maxNodes){limited=true;return;}
  if(cost+lower[i]>score(best))return;
  if(i===work.length){const candidate=plan([...lines],missing);if(score(candidate)<score(best))best=candidate;return;}
  for(const q of work[i].options){visit(i+1,[...lines,q],cost+q.cost);if(limited)return;}
 }
 if(!missing.length)visit(0,[],0);
 const split={...best,optimal:!limited&&!missing.length&&score(best)<Infinity,nodes};
 const store=stores.includes(shopping.singleStore)?shopping.singleStore:stores[0];
 return {singles,split,current:shopping.mode==='split'?split:singles.find(s=>s.store===store)||plan([],items.map(i=>i.id)),stores};
}
export function lineKey(line){return line.offer.storeId+':'+line.item.id;}
export function fingerprint(line){return JSON.stringify([line.offer.id,line.offer.optionId,line.packs,line.offer.packQuantity,line.offer.unit]);}
export function handoffState(line,shopping,week){const r=shopping.handoffs[week]?.[lineKey(line)];return !r?'pending':r.fingerprint!==fingerprint(line)?'changed':r.status;}
export function handoffLines(plan,shopping,week,purchased={}){return plan.lines.filter(l=>!purchased[l.item.id]&&handoffState(l,shopping,week)!=='confirmed');}
