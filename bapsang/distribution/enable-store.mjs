// Run only after the real store listing is public in Korea. No accounts, payments or ads are created here.
import {readFile,writeFile,rename} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyAndroidListing,verifyAppleListing} from './verify-listing.mjs';
import {validateConfig,storeUrl} from '../install/router.mjs';
const args=process.argv.slice(2),allowed=new Set(['--platform','--app-store-id','--provider-token']),options={};
for(let i=0;i<args.length;i+=2){if(!allowed.has(args[i])||!args[i+1]||options[args[i]])throw Error('Invalid command arguments');options[args[i]]=args[i+1];}
const platform=options['--platform'];if(!['android','ios'].includes(platform))throw Error('--platform android 또는 ios가 필요합니다.');
const id=options['--app-store-id'];if(platform==='ios'&&!/^\d{6,15}$/.test(id||''))throw Error('실제 발급된 App Store 숫자 ID가 필요합니다.');
const token=options['--provider-token'];if(token&&!/^\d{1,30}$/.test(token))throw Error('App Store Connect에서 실제 발급된 provider token을 사용해주세요.');
const file=resolve(fileURLToPath(new URL('../install/config.json',import.meta.url))),original=await readFile(file,'utf8'),config=validateConfig(JSON.parse(original));
try{
 const url=platform==='android'?'https://play.google.com/store/apps/details?id='+config.packageId+'&hl=ko&gl=KR':'https://itunes.apple.com/lookup?'+new URLSearchParams({id,country:'kr',entity:'software'});
 const response=await fetch(url,{redirect:'manual',signal:AbortSignal.timeout(20000),headers:{'User-Agent':'Mozilla/5.0 (compatible; BapsangReleaseVerifier/1.0; +https://migaryos.com/bapsang/)'}});
 if(!response.ok)throw Error('공개 스토어 확인 실패: HTTP '+response.status);
 const body=await response.text();if(body.length>10000000)throw Error('스토어 응답이 너무 큽니다.');
 const verified=platform==='android'?verifyAndroidListing(body):verifyAppleListing(JSON.parse(body),id);
 config[platform]={...config[platform],status:'published',url:verified.url,verifiedAt:new Date().toISOString(),...(platform==='ios'?{appStoreId:id,...(token?{campaignProviderToken:token}:{})}:{})};
 if(!storeUrl(config,platform))throw Error('설치 연결 설정 검증 실패');
 // Avoid overwriting another operator's publication update.
 if(await readFile(file,'utf8')!==original)throw Error('설정이 변경됐습니다. 최신 파일에서 다시 실행해주세요.');
 await writeFile(file+'.pending',JSON.stringify(config,null,2)+'\n');await rename(file+'.pending',file);
 console.log(JSON.stringify({platform,verified:true,name:verified.name,url:verified.url,configUpdated:true,next:'Run routing tests, commit and publish this config to activate the unchanged advertising link.'}));
}catch(error){console.error('자동 연결을 활성화하지 않았습니다. '+error.message);process.exitCode=1;}
