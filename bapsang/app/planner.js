import {INGREDIENTS,RECIPES,DEFAULT_PREFS,DEFAULT_PANTRY,DISLIKE_OPTIONS} from './data.js';
export const won=n=>'₩'+Math.round(n).toLocaleString('ko-KR');
export const amount=n=>Number(n.toFixed(1)).toLocaleString('ko-KR');
export function recipeCost(r,people=1){return Object.entries(r.ing).reduce((sum,[id,q])=>sum+q/INGREDIENTS[id].pack*INGREDIENTS[id].price,0)*people;}
export function ingredientIds(r){
 const ids=new Set();
 function visit(id){if(ids.has(id))return;ids.add(id);for(const child of INGREDIENTS[id]?.contains||[])visit(child);}
 for(const id of Object.keys(r.ing))visit(id);
 return [...ids];
}
export function allergens(r){return [...new Set(ingredientIds(r).flatMap(id=>INGREDIENTS[id]?.allergens||[]))];}
const dislikeIngredients=Object.fromEntries(DISLIKE_OPTIONS.map(x=>[x.id,x.ingredients]));
export function hasDislikedIngredient(r,dislikes){const ids=new Set(ingredientIds(r));return dislikes.some(id=>(dislikeIngredients[id]||[id]).some(x=>ids.has(x)));}
const meatIngredient=id=>INGREDIENTS[id]?.category==='육류·달걀'&&id!=='egg';
const seafoodIngredient=id=>INGREDIENTS[id]?.category==='생선·해산물';
export const spicy=r=>ingredientIds(r).some(id=>['kimchi','gochujang','chili','hotpepper'].includes(id));
export function allowed(r,p,meal=null){
 if(allergens(r).some(x=>p.allergies.includes(x)))return false;
 if(r.tools.some(x=>!p.tools.includes(x)))return false;
 if(r.ing.rice&&!p.tools.some(x=>x==='stove'||x==='ricecooker'))return false;
 if(hasDislikedIngredient(r,p.dislikes||[]))return false;
 if(p.style==='quick'&&r.time>20)return false;
 if((p.style==='protein'||p.diet==='protein')&&(!Number.isFinite(r.protein)||r.protein<(meal==='snack'?8:18)))return false;
 const ids=ingredientIds(r),tags=allergens(r),hasMeat=ids.some(meatIngredient),hasSeafood=ids.some(seafoodIngredient)||tags.some(x=>x==='fish'||x==='shellfish');
 if((p.style==='vegan'||p.diet==='vegan')&&(hasMeat||hasSeafood||tags.some(x=>x==='milk'||x==='egg')))return false;
 if(p.diet==='vegetarian'&&(hasMeat||hasSeafood))return false;
 if(p.diet==='pescatarian'&&hasMeat)return false;
 if(p.diet==='keto'&&(!Number.isFinite(r.carbs)||r.carbs>15))return false;
 if(p.diet==='glutenfree'&&allergens(r).includes('wheat'))return false;
 if(p.diet==='dairyfree'&&allergens(r).includes('milk'))return false;
 if(p.diet==='mediterranean'&&['pork','beef'].some(x=>x in r.ing))return false;
 if(p.vibes?.includes('quick')&&r.time>20)return false;
 if(p.vibes?.includes('family')&&spicy(r))return false;
 return true;
}
function preferenceScore(r,p){
 const v=p.vibes||[];let n=0;
 if(v.includes('onepan')&&r.tools.length<=1&&!['bibimbap','noodles'].includes(r.id))n-=3;
 if(v.includes('comfort')&&/찌개|죽|국수/.test(r.name))n-=4;
 if(v.includes('fresh')&&Object.keys(r.ing).some(x=>['cucumber','spinach','cabbage'].includes(x)))n-=3;
 if(v.includes('fiber')&&Object.keys(r.ing).some(x=>['oat','tofu','cabbage','spinach'].includes(x)))n-=3;
 if(v.includes('takeout')&&/덮밥|볶음밥|토스트/.test(r.name))n-=4;
 return n;
}
export function groceries(plan,pantry,people,recipes=RECIPES,extra={}){
 const totals={};
 for(const day of plan)for(const slot of day){const r=recipes.find(x=>x.id===slot.recipe);if(r)for(const [id,q]of Object.entries(r.ing))totals[id]=(totals[id]||0)+q*people;}
 for(const [id,q]of Object.entries(extra))if(Object.hasOwn(INGREDIENTS,id)&&Number.isFinite(q)&&q>0)totals[id]=(totals[id]||0)+q;
 return Object.entries(totals).map(([id,quantity])=>{const i=INGREDIENTS[id],owned=Number(pantry[id])||0,need=Math.max(0,quantity-owned),packs=Math.ceil((need-0.00001)/i.pack);return {id,...i,quantity,owned,need,packs,cost:Math.max(0,packs)*i.price};}).sort((a,b)=>a.category.localeCompare(b.category,'ko')||a.name.localeCompare(b.name,'ko'));
}
export function totalCost(plan,pantry,people,recipes=RECIPES,extra={}){return groceries(plan,pantry,people,recipes,extra).reduce((n,x)=>n+x.cost,0);}
export function makePlan(p=DEFAULT_PREFS,pantry=DEFAULT_PANTRY,seed=0,recipes=RECIPES){
 if(!p.meals.length)throw new Error('계획할 끼니를 하나 이상 골라주세요.');
 if(p.days&&!p.days.length)throw new Error('요리할 요일을 하나 이상 골라주세요.');
 const pools=Object.fromEntries(p.meals.map(m=>[m,recipes.filter(r=>r.meals.includes(m)&&allowed(r,p,m))]));
 for(const [meal,pool]of Object.entries(pools))if(!pool.length)throw new Error(({breakfast:'아침',lunch:'점심',dinner:'저녁',snack:'간식'}[meal])+' 조건에 맞는 레시피가 없어요. 조리도구나 식사 취향을 조정해주세요. 알레르기는 그대로 유지하세요.');
 let best=null,bestScore=Infinity;
 for(let attempt=0;attempt<24;attempt++){
  const used={},plan=[];
  for(let d=0;d<7;d++){
   const slots=[];
   if(p.days&&!p.days.includes(d)){plan.push(slots);continue;}
   for(let mi=0;mi<p.meals.length;mi++){
    const meal=p.meals[mi];
    const ordered=[...pools[meal]].sort((a,b)=>{
     const score=r=>(used[r.id]||0)*(p.vibes?.includes('batch')?10:30)+preferenceScore(r,p) + recipeCost(r)*.001 - Object.keys(r.ing).filter(id=>(pantry[id]||0)>0).length*1.2 + ((recipes.indexOf(r)*17+seed*13+attempt*7+d*11+mi*5)%31)*.26;
     return score(a)-score(b);
    });
    const r=ordered[0];slots.push({meal,recipe:r.id,cooked:false});used[r.id]=(used[r.id]||0)+1;
   }
   plan.push(slots);
  }
  const price=totalCost(plan,pantry,p.people,recipes);
  const repetitions=Object.values(used).reduce((n,q)=>n+Math.max(0,q-2),0);
  const score=Math.max(0,price-p.budget)*100+price+repetitions*600;
  if(score<bestScore){bestScore=score;best=plan;}
 }
 return best;
}
export function swapRecipe(plan,day,index,p,pantry,choice,recipes=RECIPES){
 const next=structuredClone(plan),current=next[day][index],used=plan.flat().map(x=>x.recipe);
 const pool=recipes.filter(r=>r.id!==current.recipe&&r.meals.includes(current.meal)&&allowed(r,p,current.meal));
 if(!pool.length)throw new Error('현재 조건에 맞는 대체 메뉴가 없어요.');
 const candidates=pool.map(r=>{const draft=structuredClone(plan);draft[day][index].recipe=r.id;return {r,score:Math.max(0,totalCost(draft,pantry,p.people,recipes)-p.budget)*100+(used.includes(r.id)?5000:0)+recipeCost(r)};}).sort((a,b)=>a.score-b.score);
 const selected=choice?pool.find(r=>r.id===choice):candidates[0].r;
 if(!selected)throw new Error('선택할 수 없는 레시피예요.');
 next[day][index]={...current,recipe:selected.id,cooked:false};return next;
}
export function mondayKey(date=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const k=new Date(Date.UTC(Number(parts.year),Number(parts.month)-1,Number(parts.day)));
 k.setUTCDate(k.getUTCDate()-(k.getUTCDay()+6)%7);return k.toISOString().slice(0,10);
}
export function dateAt(key,day=0){const d=new Date(key+'T12:00:00');d.setDate(d.getDate()+day);return d;}

export function shiftWeek(key,offset){
 const d=new Date(key+'T12:00:00Z');
 if(!Number.isInteger(offset)||Number.isNaN(d.getTime()))throw new Error('주간 날짜가 올바르지 않아요.');
 d.setUTCDate(d.getUTCDate()+offset*7);return d.toISOString().slice(0,10);
}
export function setMeal(plan,day,meal,recipeId,p,recipes=RECIPES){
 if(!Number.isInteger(day)||day<0||day>6||!['breakfast','lunch','dinner','snack'].includes(meal))throw new Error('끼니 위치를 확인해주세요.');
 const r=recipes.find(x=>x.id===recipeId);
 if(!r||!r.meals.includes(meal)||!allowed(r,p,meal))throw new Error('알레르기·기피 재료·식사 취향·조리도구 조건에 맞지 않는 레시피예요.');
 const next=structuredClone(plan);
 if(next.length!==7)throw new Error('주간 식단을 확인해주세요.');
 const at=next[day].findIndex(x=>x.meal===meal),slot={meal,recipe:recipeId,cooked:false};
 if(at<0)next[day].push(slot);else next[day][at]=slot;
 const order=['breakfast','lunch','dinner','snack'];next[day].sort((a,b)=>order.indexOf(a.meal)-order.indexOf(b.meal));
 return next;
}
