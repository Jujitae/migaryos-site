import {validateShopping} from './commerce.js';
import {INGREDIENTS,RECIPES,STORES,MEALS,TOOLS,ALLERGENS,DISLIKE_OPTIONS} from './data.js';
import {validateLibrary} from './recipe-library.js';
const storeIds=new Set(STORES.map(s=>s.id)),dislikeIds=new Set(DISLIKE_OPTIONS.map(x=>x.id));
const plain=x=>x!==null&&typeof x==='object'&&!Array.isArray(x);
const fail=()=>{throw new Error('밥상 백업 파일의 형식이나 재료 정보가 올바르지 않아요. 현재 데이터는 바꾸지 않았어요.');};
function array(value,known,max=200){if(!Array.isArray(value)||value.length>max||value.some(x=>!known.has(x))||new Set(value).size!==value.length)fail();return [...value];}
function number(value,min,max){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)fail();return value;}
function week(value){if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||Number.isNaN(Date.parse(value))||new Date(value+'T00:00:00Z').toISOString().slice(0,10)!==value)fail();return value;}
export function validateState(input){
 if(!plain(input)||input.version!==1||!plain(input.prefs)||!plain(input.weeks)||!plain(input.pantry))fail();
 const library=validateLibrary(input),recipeIds=library.recipeIds;
 const p=input.prefs;if(!storeIds.has(p.store))fail();
 const prefs={store:p.store,people:number(p.people,.5,16),budget:number(p.budget,10000,1000000),meals:array(p.meals,new Set(Object.keys(MEALS)),4),tools:array(p.tools,new Set(Object.keys(TOOLS)),8),allergies:array(p.allergies,new Set(Object.keys(ALLERGENS))),dislikes:array(p.dislikes||[],dislikeIds),style:p.style||'balanced',diet:p.diet||'none',vibes:array(p.vibes||[],new Set(['quick','onepan','batch','family','comfort','fresh','fiber','takeout']),8),days:array(p.days||[0,1,2,3,4,5,6],new Set([0,1,2,3,4,5,6]),7)};
 if(!prefs.meals.length||!prefs.days.length||!['balanced','quick','protein','vegan'].includes(prefs.style)||!['none','vegetarian','vegan','pescatarian','keto','protein','glutenfree','dairyfree','mediterranean'].includes(prefs.diet))fail();
 for(const id of ['adults','kids'])if(p[id]!==undefined){prefs[id]=number(p[id],0,8);if(!Number.isInteger(p[id]))fail();}
 if(p.stores!==undefined){prefs.stores=array(p.stores,storeIds,3);if(!prefs.stores.length||prefs.stores[0]!==p.store)fail();}
 const pantry={};for(const [id,q]of Object.entries(input.pantry)){if(!Object.hasOwn(INGREDIENTS,id))fail();pantry[id]=number(q,0,100000);}
 const weeks={};if(Object.keys(input.weeks).length>260)fail();
 for(const [key,plan]of Object.entries(input.weeks)){
  week(key);if(!Array.isArray(plan)||plan.length!==7)fail();
  weeks[key]=plan.map(day=>{if(!Array.isArray(day)||day.length>4)fail();const seen=new Set();return day.map(s=>{if(!plain(s)||!recipeIds.has(s.recipe)||!Object.hasOwn(MEALS,s.meal)||seen.has(s.meal)||typeof s.cooked!=='boolean')fail();seen.add(s.meal);return {meal:s.meal,recipe:s.recipe,cooked:s.cooked};});});
 }
 const checked={};if(input.checked!==undefined&&!plain(input.checked))fail();
 for(const [key,values]of Object.entries(input.checked||{})){week(key);if(!plain(values))fail();checked[key]={};for(const [id,v]of Object.entries(values)){if(!Object.hasOwn(INGREDIENTS,id)||typeof v!=='boolean')fail();checked[key][id]=v;}}
 const extraGroceries={};if(input.extraGroceries!==undefined&&!plain(input.extraGroceries))fail();
 for(const [key,items]of Object.entries(input.extraGroceries||{})){week(key);if(!plain(items))fail();extraGroceries[key]={};for(const [id,q]of Object.entries(items)){if(!Object.hasOwn(INGREDIENTS,id))fail();extraGroceries[key][id]=number(q,0,100000);}}
 return {version:1,prefs,pantry,weeks,checked,shopping:validateShopping(input.shopping),userRecipes:library.userRecipes,cookbooks:library.cookbooks,extraGroceries,saved:array(input.saved||[],recipeIds,recipeIds.size),week:week(input.week),accepted:Boolean(input.accepted),onboardingRevision:input.onboardingRevision===2?2:1};
}
export function createBackup(state){return JSON.stringify({format:'bapsang-backup',formatVersion:3,createdAt:new Date().toISOString(),state:validateState(state)},null,2);}
export function parseBackup(text){if(typeof text!=='string'||text.length>5*1024*1024)fail();let file;try{file=JSON.parse(text);}catch{fail();}if(file?.format!=='bapsang-backup'||![1,2,3].includes(file.formatVersion))fail();return validateState(file.state);}
