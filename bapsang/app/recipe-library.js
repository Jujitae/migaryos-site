import {INGREDIENTS,RECIPES,MEALS,TOOLS,DISLIKE_OPTIONS} from './data.js';

const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const problem=message=>{throw new Error(message);};
export function publicRecipeUrl(value){
 if(!value)return '';
 let u;try{u=new URL(value);}catch{problem('올바른 https 레시피 링크를 입력해주세요.');}
 const host=u.hostname.toLowerCase();
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||!host.includes('.')||host.endsWith('.local')||host.endsWith('.localhost')||host.endsWith('.internal')||host.includes(':')||/^\d+(\.\d+){3}$/.test(host)||host==='localhost')problem('공개된 https 레시피 링크만 사용할 수 있어요.');
 return u.href;
}

export function validateCustomRecipe(input){
 if(!plain(input)||typeof input.id!=='string'||!/^own-[a-z0-9-]{1,72}$/.test(input.id))problem('레시피 정보가 올바르지 않아요.');
 if(typeof input.name!=='string'||!input.name.trim()||input.name.length>100)problem('레시피 이름은 100자 안으로 입력해주세요.');
 if(!plain(input.ing)||!Object.keys(input.ing).length||Object.keys(input.ing).length>60)problem('재료를 한 가지 이상 등록해주세요.');
 const ing={};
 for(const [id,q]of Object.entries(input.ing)){
  if(!Object.hasOwn(INGREDIENTS,id)||typeof q!=='number'||!Number.isFinite(q)||q<=0||q>100000)problem('재료와 수량을 확인해주세요.');
  ing[id]=q;
 }
 if(!Array.isArray(input.steps)||input.steps.length<1||input.steps.length>60||input.steps.some(s=>typeof s!=='string'||!s.trim()||s.length>2000))problem('만드는 방법을 한 줄에 한 단계씩 입력해주세요.');
 if(!Array.isArray(input.meals)||!input.meals.length||input.meals.length>4||input.meals.some(m=>!Object.hasOwn(MEALS,m))||new Set(input.meals).size!==input.meals.length)problem('끼니를 한 가지 이상 선택해주세요.');
 if(!Array.isArray(input.tools)||input.tools.length>8||input.tools.some(t=>!Object.hasOwn(TOOLS,t))||new Set(input.tools).size!==input.tools.length)problem('조리도구를 확인해주세요.');
 if(!Number.isFinite(input.time)||input.time<1||input.time>1440)problem('조리 시간은 1~1,440분으로 입력해주세요.');
 const nutrition={};
 for(const key of ['kcal','protein','carbs','fat']){
  const n=input[key];
  if(n!==null&&n!==undefined&&(!Number.isFinite(n)||n<0||n>10000))problem('영양 정보는 0 이상의 숫자로 입력해주세요.');
  nutrition[key]=n??null;
 }
 return {id:input.id,name:input.name.trim(),emoji:'🍽️',ing,steps:input.steps.map(s=>s.trim()),meals:[...input.meals],tools:[...input.tools],time:input.time,...nutrition,note:'직접 등록한 레시피 · 재료와 알레르기를 확인해주세요.',sourceUrl:publicRecipeUrl(input.sourceUrl||'')};
}

const normalized=s=>s.toLowerCase().replace(/[\s·._()-]/g,'');
const aliases={rice:['쌀','생쌀'],egg:['계란','달걀'],chicken:['닭가슴살'],pork:['돼지고기','돈육'],beef:['소고기','쇠고기'],soy:['간장'],sesame:['참기름'],oil:['식용유','올리브유'],greenonion:['대파','파'],milk:['우유'],yogurt:['요거트','요구르트']};
export function ingredientId(name){
 const needle=normalized(name);
 for(const [id,i]of Object.entries(INGREDIENTS))if(normalized(i.name)===needle||id===name||(aliases[id]||[]).some(x=>normalized(x)===needle))return id;
 for(const option of DISLIKE_OPTIONS)if(option.ingredients.length===1&&(normalized(option.label)===needle||(option.aliases||[]).some(x=>normalized(x)===needle)))return option.ingredients[0];
 return null;
}

// No guessed weights: imported amounts must match a catalog unit or a precise kg/L conversion.
export function parseIngredientLines(text,servings=1){
 if(!Number.isFinite(servings)||servings<.5||servings>16)problem('원본 레시피 인분을 0.5~16으로 입력해주세요.');
 const ing={},issues=[];
 for(const raw of text.split('\n').map(x=>x.trim()).filter(Boolean)){
  const line=raw.replace(/^[-•*]\s*/,''),match=line.match(/^(.+?)\s+(\d+(?:\.\d+)?|\d+\/\d+)\s*(kg|g|ml|l|개|장|큰술|작은술)$/i)||line.match(/^(\d+(?:\.\d+)?|\d+\/\d+)\s*(kg|g|ml|l|개|장|큰술|작은술)\s+(.+)$/i)?.map((v,i,a)=>i===1?a[3]:i===2?a[1]:i===3?a[2]:v);
  if(!match){issues.push(raw);continue;}
  const id=ingredientId(match[1]);if(!id){issues.push(raw);continue;}
  let q=match[2].includes('/')?match[2].split('/').map(Number).reduce((a,b)=>a/b):Number(match[2]),unit=match[3].toLowerCase();
  if(unit==='kg'){q*=1000;unit='g';}if(unit==='l'){q*=1000;unit='ml';}
  if(INGREDIENTS[id].unit==='ml'&&(unit==='큰술'||unit==='작은술')){q*=unit==='큰술'?15:5;unit='ml';}
  if(INGREDIENTS[id].unit!==unit||!Number.isFinite(q)||q<=0||q/servings>100000){issues.push(raw);continue;}
  ing[id]=(ing[id]||0)+q/servings;
 }
 return {ing,issues};
}

export function parseRecipeText(text){
 const lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
 if(!lines.length||text.length>50000)problem('레시피 내용을 50,000자 안으로 붙여넣어주세요.');
 const title=lines[0].replace(/^#+\s*/,''),ingredients=[],steps=[];
 let section='ingredients';
 for(const line of lines.slice(1)){
  if(/^(재료|준비\s*재료|ingredients)\s*[:：]?$/i.test(line)){section='ingredients';continue;}
  if(/^(만드는\s*(법|방법)|조리\s*(법|방법)|instructions|directions|steps)\s*[:：]?$/i.test(line)){section='steps';continue;}
  if(section==='steps'||/^\d+[.)]\s/.test(line)){section='steps';steps.push(line.replace(/^\d+[.)]\s*/,''));}
  else ingredients.push(line);
 }
 return {name:title,ingredientText:ingredients.join('\n'),stepsText:steps.join('\n')};
}

export function recipeFromStructuredData(objects){
 const found=[];let visited=0;
 const walk=value=>{
  if(++visited>2000)return;
  if(Array.isArray(value)){for(const x of value)walk(x);return;}
  if(!plain(value))return;
  const types=Array.isArray(value['@type'])?value['@type']:[value['@type']];
  if(types.some(x=>typeof x==='string'&&/(^|[\/#])Recipe$/.test(x)))found.push(value);
  for(const [k,v]of Object.entries(value))if(k!=='@context'&&v&&typeof v==='object')walk(v);
 };
 walk(objects);const r=found.find(x=>typeof x.name==='string'&&Array.isArray(x.recipeIngredient));
 if(!r)problem('이 페이지에서 구조화된 레시피를 찾지 못했어요. 게시물의 재료와 만드는 법을 복사해 붙여넣어주세요.');
 const steps=[];const add=x=>{if(typeof x==='string')steps.push(x);else if(plain(x)){if(typeof x.text==='string')steps.push(x.text);if(Array.isArray(x.itemListElement))x.itemListElement.forEach(add);}};
 (Array.isArray(r.recipeInstructions)?r.recipeInstructions:[r.recipeInstructions]).forEach(add);
 const yieldMatch=String(r.recipeYield||'').match(/\d+(?:\.\d+)?/),minutes=String(r.totalTime||r.cookTime||'').match(/^PT(?:(\d+)H)?(?:(\d+)M)?$/);
 return {name:r.name.slice(0,100),ingredientText:r.recipeIngredient.filter(x=>typeof x==='string').join('\n'),stepsText:steps.join('\n'),servings:yieldMatch?Number(yieldMatch[0]):1,time:minutes?Number(minutes[1]||0)*60+Number(minutes[2]||0):20};
}

export function validateLibrary(input,knownIds=new Set(RECIPES.map(x=>x.id))){
 const userRecipes=input.userRecipes??[];
 if(!Array.isArray(userRecipes)||userRecipes.length>300)problem('직접 등록한 레시피 수를 확인해주세요.');
 const recipes=userRecipes.map(validateCustomRecipe),ids=new Set([...knownIds,...recipes.map(x=>x.id)]);
 if(ids.size!==knownIds.size+recipes.length)problem('레시피가 중복됐어요.');
 const books=input.cookbooks??[];
 if(!Array.isArray(books)||books.length>50)problem('요리책 수를 확인해주세요.');
 const seen=new Set();
 const cookbooks=books.map(b=>{
  if(!plain(b)||typeof b.id!=='string'||!/^book-[a-z0-9-]{1,72}$/.test(b.id)||seen.has(b.id)||typeof b.name!=='string'||!b.name.trim()||b.name.length>60||!Array.isArray(b.recipes)||b.recipes.length>500||new Set(b.recipes).size!==b.recipes.length||b.recipes.some(id=>!ids.has(id)))problem('요리책 정보가 올바르지 않아요.');
  seen.add(b.id);return {id:b.id,name:b.name.trim(),recipes:[...b.recipes]};
 });
 return {userRecipes:recipes,cookbooks,recipeIds:ids};
}
