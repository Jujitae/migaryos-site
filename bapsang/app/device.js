// The web version uses localStorage; installed apps provide a native bridge.
const bridge=()=>globalThis.BapsangBridge;
export const isNativeApp=()=>Boolean(bridge()?.native);
export const isBundledApp=()=>Boolean(bridge()?.bundled);
let writes=Promise.resolve();
export async function readState(key){
 if(!isNativeApp())return globalThis.localStorage.getItem(key);
 const value=await bridge().readState(key);
 if(value!==null)return value;
 const legacy=globalThis.localStorage.getItem(key);
 if(legacy!==null){await bridge().writeState(key,legacy);globalThis.localStorage.removeItem(key);}
 return legacy;
}
export function writeState(key,value){
 const snapshot=String(value);
 writes=writes.catch(()=>{}).then(()=>isNativeApp()?bridge().writeState(key,snapshot):globalThis.localStorage.setItem(key,snapshot));
 return writes;
}
export async function deleteState(key){await writes.catch(()=>{});if(isNativeApp())await bridge().deleteState(key);globalThis.localStorage.removeItem(key);}
export async function clipboard(text){if(isNativeApp())return bridge().clipboard(text);return navigator.clipboard.writeText(text);}
export async function shareText(title,text){
 if(isNativeApp())return bridge().shareText(title,text);
 if(navigator.share){try{await navigator.share({title,text});return true;}catch(e){if(e.name==='AbortError')return false;throw e;}}
 await clipboard(text);return true;
}
export async function exportText(name,text,type='text/plain;charset=utf-8'){
 if(isNativeApp())return bridge().exportText(name,text);
 const url=URL.createObjectURL(new Blob([text],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return true;
}
export async function fetchRecipePage(url){
 try{
  if(isNativeApp())return await bridge().fetchRecipePage(url);
  const response=await fetch(url,{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('레시피 페이지를 읽지 못했어요.');
  const html=await response.text();if(html.length>2*1024*1024)throw new Error('페이지가 너무 커요. 레시피 내용을 붙여넣어주세요.');return html;
 }catch(e){throw new Error(e.message?.includes('너무 커')?e.message:'이 페이지는 직접 읽기를 허용하지 않거나 접근할 수 없어요. 레시피 내용을 복사해 붙여넣어주세요.');}
}
