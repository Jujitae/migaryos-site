import {INGREDIENTS} from './data.js';
import {optionsFor,searchUrl} from './commerce.js';

// The usable grocery list never depends on a complete retailer checkout quote.
// Reference prices stay explicitly separate from observed product prices.
export function presentBasket(items,plan,stores,offers,prefs,shopping,now=Date.now()){
 const primary=stores.includes(shopping.singleStore)?shopping.singleStore:stores[0];
 const rows=items.map(item=>{
  const committed=plan.lines.find(l=>l.item.id===item.id),store=committed?.offer.storeId||primary,pinned=shopping.selections[store+':'+item.id];
  const candidates=optionsFor(item,store,offers,prefs,shopping,now);
  const q=committed||candidates.find(q=>(!pinned||q.offer.id===pinned)&&q.offer.availability==='in-stock'&&!q.risk.blocked.length&&(q.offer.priceKind==='general'||q.offer.priceKind==='member'&&(shopping.settings[store]?.member||store==='costco')||q.offer.priceKind==='coupon'&&shopping.settings[store]?.coupon)&&['','제품 성분 확인 필요','가격 다시 확인',...(store==='costco'?['멤버십 적용 확인 필요']:[])].includes(q.reason));
  const i=INGREDIENTS[item.id],packs=q?.packs??Math.ceil((item.need-1e-7)/i.pack),packQuantity=q?.offer.packQuantity??i.pack,cost=q?.cost??packs*i.price;
  const source=q?(now-Date.parse(q.offer.observedAt)>21600000?'previous':'observed'):'estimate';
  const discountPreview=q&&candidates.find(x=>x.offer.productId===q.offer.productId&&x.offer.priceKind==='coupon'&&x.offer.availability==='in-stock'&&!x.risk.blocked.length&&now-Date.parse(x.offer.observedAt)<=21600000&&x.cost<q.cost);
  return {item,store,q,discountPreview,packs,packQuantity,purchased:packs*packQuantity,leftover:Math.max(0,packs*packQuantity-item.need),cost,source,url:q?.offer.url||searchUrl(store,item.name),directProduct:!!q?.offer.url};
 });
 return {rows,subtotal:rows.reduce((n,r)=>n+r.cost,0),observed:rows.filter(r=>r.source==='observed').length,previous:rows.filter(r=>r.source==='previous').length,estimated:rows.filter(r=>r.source==='estimate').length,completeQuote:plan.complete&&plan.total!==null};
}
