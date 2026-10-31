import {destination,storeUrl,validateConfig} from './router.mjs';
const status=document.querySelector('#status'),heading=document.querySelector('#heading'),note=document.querySelector('#note'),web=document.querySelector('#web'),hint=document.querySelector('#browser-hint');
try{
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),8000);let response;
 try{response=await fetch('./config.json',{cache:'no-store',credentials:'omit',signal:controller.signal});}finally{clearTimeout(timer);}
 if(!response.ok)throw Error('Configuration unavailable');
 const config=validateConfig(await response.json()),target=destination(config,{userAgent:navigator.userAgent,maxTouchPoints:navigator.maxTouchPoints,search:location.search});
 web.href=target.webUrl;
 document.querySelector('.preview').hidden=target.platform==='ios'||!!storeUrl(config,'android');
 for(const [os,label]of [['android','Google Play'],['ios','App Store']]){
  const item=document.querySelector('#'+os),url=storeUrl(config,os,location.search);
  item.classList.toggle('available',!!url);item.querySelector('small').textContent=url?'설치 화면 열기':config[os].status==='in_review'?'심사 진행 중':'출시 준비 중';
  if(url){item.href=url;item.removeAttribute('aria-disabled');item.removeAttribute('tabindex');}else{item.removeAttribute('href');item.setAttribute('aria-disabled','true');item.setAttribute('tabindex','-1');}
  item.setAttribute('aria-label',label+' · '+item.querySelector('small').textContent);
 }
 if(target.storeUrl){
  const label=target.platform==='android'?'Google Play':'App Store';status.textContent='설치 화면으로 이동 중';heading.textContent='밥상에서 만나요.';note.textContent=label+'의 밥상 설치 화면을 열고 있어요. 자동으로 열리지 않으면 아래 스토어 버튼을 눌러주세요.';
  if(target.inApp){hint.hidden=false;hint.textContent='인스타그램 등 앱 안에서 스토어가 열리지 않으면, 화면 메뉴에서 외부 브라우저로 열어주세요.';}
  // HTTPS store links let the OS/browser choose its supported app handoff.
  // replace avoids a redirect loop when the visitor presses Back.
  setTimeout(()=>{try{location.replace(target.storeUrl);}catch{status.textContent='스토어에서 밥상 설치하기';note.textContent='아래 스토어 버튼을 눌러 설치 화면을 열어주세요.';}},350);
 }else{
  const anyLive=storeUrl(config,'android')||storeUrl(config,'ios');
  status.textContent=anyLive?'밥상 설치 안내':'정식 스토어 출시 준비 중';
  heading.textContent='이번 주 집밥,\n가볍게 시작해요.';
  note.textContent=target.platform==='desktop'&&anyLive?'사용할 기기에 맞는 스토어를 선택해주세요. 웹에서도 바로 시작할 수 있어요.':target.platform!=='desktop'&&anyLive?'이 기기의 스토어 버전은 아직 준비 중이에요. 지금은 웹에서 먼저 사용해보세요.':'스토어 버전은 준비 중이에요. 기다리는 동안 웹에서 식단과 장보기 목록을 먼저 만들어보세요.';
 }
}catch{
 status.textContent='밥상 시작하기';note.textContent='설치 경로를 불러오지 못했어요. 웹으로 바로 시작하거나 잠시 후 다시 방문해주세요.';
}
