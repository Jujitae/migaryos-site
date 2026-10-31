import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {platformOf,storeUrl,destination,campaignParams} from '../../install/router.mjs';
import {verifyAndroidListing,verifyAppleListing} from '../verify-listing.mjs';
const draft=JSON.parse(await readFile(new URL('../../install/config.json',import.meta.url),'utf8'));
const now=new Date().toISOString(),id='1000000001'; // isolated test ID, never a configured production store destination
const live=()=>({...structuredClone(draft),android:{status:'published',verifiedAt:now,url:'https://play.google.com/store/apps/details?id=com.migaryos.bapsang'},ios:{status:'published',verifiedAt:now,appStoreId:id,url:'https://apps.apple.com/kr/app/id'+id,campaignProviderToken:null}});
test('Android, iPhone and iPad desktop-mode detection does not send ordinary Macs to App Store',()=>{
 assert.equal(platformOf('Linux; Android 15'),'android');assert.equal(platformOf('iPhone OS 18_0'),'ios');assert.equal(platformOf('iPad'),'ios');assert.equal(platformOf('Macintosh; Intel Mac OS X',5),'ios');assert.equal(platformOf('Macintosh; Intel Mac OS X',0),'desktop');assert.equal(platformOf('Windows NT 10.0'),'desktop');
});
test('unsubmitted, in-review and paused releases never redirect to store or APK downloads',()=>{
 for(const status of ['not_submitted','in_review','paused']){const c=live();c.android.status=status;c.ios.status=status;for(const userAgent of ['Android','iPhone','Windows']){const d=destination(c,{userAgent});assert.equal(d.storeUrl,null);assert.equal(d.webUrl,'https://migaryos.com/bapsang/app/');}}
});
test('phased platform releases keep the other OS on its web fallback',()=>{
 const c=live();c.ios.status='not_submitted';assert.match(destination(c,{userAgent:'Android'}).storeUrl,/play\.google\.com/);assert.equal(destination(c,{userAgent:'iPhone'}).storeUrl,null);
 c.android.status='paused';c.ios.status='published';assert.equal(destination(c,{userAgent:'Android'}).storeUrl,null);assert.match(destination(c,{userAgent:'iPhone'}).storeUrl,/apps\.apple\.com/);assert.equal(destination(c,{userAgent:'Windows'}).storeUrl,null);
});
test('no unknown URL, hostile query, wrong app ID or unverified listing becomes a redirect',()=>{
 for(const value of ['https://evil.test/','https://play.google.com.evil.test/store/apps/details?id=com.migaryos.bapsang','http://play.google.com/store/apps/details?id=com.migaryos.bapsang','https://user:pass@play.google.com/store/apps/details?id=com.migaryos.bapsang','https://play.google.com:444/store/apps/details?id=com.migaryos.bapsang','https://play.google.com/store/apps/details?id=another.app']){const c=live();c.android.url=value;assert.equal(storeUrl(c,'android'),null);}
 const c=live();c.android.verifiedAt=null;assert.equal(storeUrl(c,'android'),null);c.ios.appStoreId='1000000002';assert.equal(storeUrl(c,'ios'),null);
 assert.match(destination(live(),{userAgent:'Android',search:'?redirect=https://evil.test&platform=ios'}).storeUrl,/^https:\/\/play\.google\.com/);
});
test('only campaign fields are forwarded, safely encoded, without inventing Apple campaign credentials',()=>{
 const query='?utm_source=instagram&utm_medium=paid_social&utm_campaign=밥상%20출시&utm_content=story_v1&fbclid=private-click-id&next=https://evil.test';
 const c=live(),android=new URL(storeUrl(c,'android',query)),ref=new URLSearchParams(android.searchParams.get('referrer'));assert.equal(ref.get('utm_campaign'),'밥상 출시');assert.equal(ref.get('utm_content'),'story_v1');assert.equal(ref.has('fbclid'),false);assert.equal(ref.has('next'),false);
 assert.equal(new URL(storeUrl(c,'ios',query)).search,'');c.ios.campaignProviderToken='123456';const ios=new URL(storeUrl(c,'ios',query));assert.equal(ios.searchParams.get('ct'),'밥상 출시');assert.equal(ios.searchParams.get('pt'),'123456');
 assert.equal(campaignParams('?utm_source=%0Aevil').size,0);assert.equal(destination(draft,{search:query}).webUrl.includes('fbclid'),false);
});
test('Android publication checks the actual package, free price and publisher, not a successful HTTP status alone',()=>{
 const app={'@type':'SoftwareApplication',name:'밥상',url:'https://play.google.com/store/apps/details?id=com.migaryos.bapsang',author:{name:'Migaryos'},offers:{price:0}},html=p=>'<script type="application/ld+json">'+JSON.stringify(p)+'</script>';
 assert.match(verifyAndroidListing(html(app)).url,/com\.migaryos\.bapsang/);
 for(const changed of [{...app,name:'다른 앱'},{...app,author:{name:'Someone'}},{...app,url:'https://play.google.com/store/apps/details?id=other.app'},{...app,offers:{price:1000}}])assert.throws(()=>verifyAndroidListing(html(changed)));
});
test('Apple publication requires the exact App Store ID, bundle and free app in the Korean lookup result',()=>{
 const app={wrapperType:'software',trackId:Number(id),bundleId:'com.migaryos.bapsang',trackName:'밥상',price:0,trackViewUrl:'https://apps.apple.com/kr/app/밥상/id'+id},data=a=>({resultCount:1,results:[a]});assert.match(verifyAppleListing(data(app),id).url,/apps\.apple\.com/);
 for(const changed of [{...app,bundleId:'other.app'},{...app,trackId:1000000002},{...app,price:1000},{...app,trackViewUrl:'https://evil.test/id'+id}])assert.throws(()=>verifyAppleListing(data(changed),id));assert.throws(()=>verifyAppleListing({resultCount:0,results:[]},id));
});
