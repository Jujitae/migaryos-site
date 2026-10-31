const PACKAGE='com.migaryos.bapsang';
export function verifyAndroidListing(html){
 const products=[];
 for(const match of html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
  try{const j=JSON.parse(match[1]);products.push(...(Array.isArray(j)?j:j?.['@graph']||[j]));}catch{}
 }
 const app=products.find(p=>p?.['@type']==='SoftwareApplication'&&typeof p.name==='string'&&p.name.includes('밥상'));
 if(!app||!/(migaryos|미가리오스)/i.test(app.author?.name||'')||Number(app.offers?.price)!==0)throw Error('밥상의 무료 앱·공개 개발자 정보를 확인하지 못했습니다.');
 let url;try{url=new URL(app.url,'https://play.google.com');}catch{}
 if(!url||url.origin!=='https://play.google.com'||url.pathname!=='/store/apps/details'||url.searchParams.get('id')!==PACKAGE)throw Error('Google Play 패키지 번호가 밥상과 일치하지 않습니다.');
 return {name:app.name,url:'https://play.google.com/store/apps/details?id='+PACKAGE};
}
export function verifyAppleListing(data,appStoreId){
 const app=data?.results?.find(p=>String(p.trackId)===appStoreId&&p.wrapperType==='software');
 if(data.resultCount!==1||!app||app.bundleId!==PACKAGE||typeof app.trackName!=='string'||!app.trackName.includes('밥상')||app.price!==0)throw Error('한국 App Store에서 밥상의 무료 앱·번들 번호를 확인하지 못했습니다.');
 let url;try{url=new URL(app.trackViewUrl);}catch{}
 if(!url||url.origin!=='https://apps.apple.com'||!url.pathname.endsWith('/id'+appStoreId))throw Error('App Store 공개 주소가 앱 번호와 일치하지 않습니다.');
 return {name:app.trackName,url:'https://apps.apple.com/kr/app/id'+appStoreId};
}
