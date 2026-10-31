const PACKAGE='com.migaryos.bapsang';
const WEB='https://migaryos.com/bapsang/app/';
export const CAMPAIGN_KEYS=['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
export function platformOf(userAgent='',maxTouchPoints=0){
 if(/iPhone|iPad|iPod/i.test(userAgent)||/Macintosh/i.test(userAgent)&&maxTouchPoints>1)return 'ios';
 if(/Android/i.test(userAgent))return 'android';
 return 'desktop';
}
export function campaignParams(search=''){
 const input=new URLSearchParams(search),out=new URLSearchParams();
 for(const key of CAMPAIGN_KEYS){const raw=input.get(key);if(raw&&/[\x00-\x1f\x7f]/.test(raw))continue;const value=raw?.trim();if(value&&value.length<=100)out.set(key,value);}
 return out;
}
function verifiedAt(value){return typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=Date.now()+300000;}
export function validateConfig(c){
 if(!c||c.version!==1||c.appName!=='밥상'||c.packageId!==PACKAGE||c.webUrl!==WEB)throw Error('Invalid installation configuration');
 for(const os of ['android','ios'])if(!c[os]||!['not_submitted','in_review','published','paused'].includes(c[os].status))throw Error('Invalid publication status');
 return c;
}
export function storeUrl(config,platform,search=''){
 validateConfig(config);const s=config[platform];if(!s||s.status!=='published'||!verifiedAt(s.verifiedAt))return null;
 let u;try{u=new URL(s.url);}catch{return null;}
 if(u.protocol!=='https:'||u.username||u.password||u.port||u.hash)return null;
 const campaign=campaignParams(search);
 if(platform==='android'){
  if(u.origin!=='https://play.google.com'||u.pathname!=='/store/apps/details'||u.searchParams.get('id')!==PACKAGE)return null;
  u=new URL('https://play.google.com/store/apps/details');u.searchParams.set('id',PACKAGE);
  if(campaign.toString())u.searchParams.set('referrer',campaign.toString());return u.href;
 }
 if(platform==='ios'){
  if(!/^\d{6,15}$/.test(String(s.appStoreId||''))||u.origin!=='https://apps.apple.com'||u.pathname!=='/kr/app/id'+s.appStoreId)return null;
  u=new URL('https://apps.apple.com/kr/app/id'+s.appStoreId);
  // A provider token must come from App Store Connect; never invent one.
  const token=s.campaignProviderToken,ct=campaign.get('utm_campaign');
  if(typeof token==='string'&&/^\d{1,30}$/.test(token)&&ct){u.searchParams.set('pt',token);u.searchParams.set('ct',ct);u.searchParams.set('mt','8');}
  return u.href;
 }
 return null;
}
export function destination(config,{userAgent='',maxTouchPoints=0,search=''}={}){
 const platform=platformOf(userAgent,maxTouchPoints),campaign=campaignParams(search),web=new URL(WEB);
 for(const [key,value]of campaign)web.searchParams.set(key,value);
 return {platform,storeUrl:storeUrl(config,platform,search),webUrl:web.href,inApp:/Instagram|FBAN|FBAV|FB_IAB|KAKAOTALK|Line\//i.test(userAgent)};
}
