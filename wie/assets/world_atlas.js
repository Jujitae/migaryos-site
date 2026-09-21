/* Public evidence atlas. Routing and presentation reuse WIEWorldApp's evidence
   projection and WIEWorkspace's authenticated mutations. No private browser store. */
(function(root){
  'use strict';
  const VIEWS=['home','saved','notes','settings'];
  function readRoute(location){
    const p=new URLSearchParams(location.search||'');let focus=p.get('focus')||'';
    try{if(!focus&&(location.hash||'').startsWith('#focus='))focus=decodeURIComponent(location.hash.slice(7));}catch{}
    const legacy=location.hash==='#workspace'?'saved':location.hash==='#notes'?'notes':null;
    return {view:VIEWS.includes(p.get('view'))?p.get('view'):legacy||'home',entity:(p.get('entity')||'').slice(0,200),focus:focus.slice(0,256),q:(p.get('q')||'').slice(0,200)};
  }
  function routeURL(route){const p=new URLSearchParams();if(route.view&&route.view!=='home')p.set('view',route.view);if(route.q)p.set('q',route.q);if(route.entity)p.set('entity',route.entity);else if(route.focus)p.set('focus',route.focus);return '/wie/'+(p.size?'?'+p:'');}
  function resolveEntity(items,canonical){const matches=(items||[]).filter(x=>x.canonical===canonical);return matches.length===1&&matches[0].canonicalMatchCount===1?matches[0]:null;}
  function entityRecords(view,item,items){if(!view||!item||resolveEntity(items,item.canonical)!==item)return [];
    const lookup=new Map();for(const target of items||[])for(const key of new Set([target.id,...target.codes].map(x=>String(x).toLowerCase())))lookup.set(key,(lookup.get(key)||0)+1);
    return view.records.filter(r=>r.entity_id===item.canonical||(!r.entity_id&&typeof r.symbol==='string'&&item.codes.some(code=>code.toLowerCase()===r.symbol.toLowerCase())&&lookup.get(r.symbol.toLowerCase())===1));
  }
  function create({document:d,location,history=root.history,eventTarget=root,workspace,loadCatalogue,getView,focusRecord,renderEvidence,now=Date.now,staticOnly=false}){
    const $=id=>d.getElementById(id),el=(tag,value,cls)=>{const n=d.createElement(tag);if(value!==undefined)n.textContent=String(value);if(cls)n.className=cls;return n;};
    const button=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.addEventListener('click',fn);return b;};
    const svg=id=>{const n=d.createElementNS('http://www.w3.org/2000/svg','svg'),u=d.createElementNS('http://www.w3.org/2000/svg','use');u.setAttribute('href','#i-'+id);n.setAttribute('aria-hidden','true');n.append(u);return n;};
    const link=(label,href)=>{const n=el('a',label);n.href=href;return n;};
    let route=readRoute(location),items=null,failed=false,filter='전체',restoring=false,disposed=false,loginReason='',showAll=false;
    let pendingLogin=new URLSearchParams(location.search||'').get('login')==='save';
    const mobileQuery=eventTarget.matchMedia?.('(max-width: 850px)');let menuOpen=false;
    function syncMenu(){const mobile=mobileQuery?.matches===true,expanded=mobile&&menuOpen;
      if($('atlas-navigation')){$('atlas-navigation').hidden=mobile&&!expanded;$('atlas-navigation').dataset.open=String(expanded);}
      if($('atlas-menu-toggle')){$('atlas-menu-toggle').hidden=!mobile;$('atlas-menu-toggle').setAttribute('aria-expanded',String(expanded));}
    }
    function closeMenu(restoreFocus=false){menuOpen=false;syncMenu();if(restoreFocus)$('atlas-menu-toggle')?.focus();}
    function menuBreakpoint(){closeMenu();}
    function menuKey(event){if(event.key==='Escape'&&mobileQuery?.matches&&menuOpen){event.preventDefault();closeMenu(true);}}
    $('atlas-menu-toggle')?.addEventListener('click',()=>{menuOpen=!menuOpen;syncMenu();});
    mobileQuery?.addEventListener('change',menuBreakpoint);eventTarget.addEventListener?.('keydown',menuKey);syncMenu();
    const title={home:'세계 탐색',saved:'관심목록',notes:'내 메모',settings:'설정',entity:'대상 상세',record:'기록 상세'};
    function navigate(next,{replace=false}={}){closeMenu();route={view:'home',entity:'',focus:'',q:'',...next};const url=routeURL(route);history?.[replace?'replaceState':'pushState']?.({wie:true},'',url);if($('world-search'))$('world-search').value=route.q;render();}
    function viewName(){return route.entity?'entity':route.focus?'record':route.view;}
    function render(){if(disposed)return;const page=viewName();
      for(const panel of d.querySelectorAll('[data-atlas-page]'))panel.hidden=panel.dataset.atlasPage!==page;
      $('workspace').hidden=!['saved','notes','settings'].includes(page);
      for(const a of d.querySelectorAll('[data-atlas-view]')){if(a.dataset.atlasView===(['entity','record'].includes(page)?'home':page))a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');}
      $('atlas-location').textContent=title[page];d.title=(page==='entity'?resolveEntity(items,route.entity)?.name||'대상 상세':title[page])+' · WIE';
      const back=routeURL({view:'home',q:route.q});for(const id of ['atlas-back','record-back'])$(id).href=back;
      if(page==='home')renderCatalogue();
      if(page==='entity')renderEntity();
      if(page==='record'){
        const row=getView()?.byId.get(route.focus);
        if(row&&!restoring){restoring=true;focusRecord(row.id,false);restoring=false;}
        if(!row){$('lens-content').replaceChildren(el('h1','이 기록은 현재 표시할 수 없습니다.'),el('p','표시 기한이 지났거나 현재 공개 범위에서 확인되지 않습니다. 원문 내용을 대신 추정하지 않습니다.','empty'),button('기록 다시 확인',()=>root.WIEWorld?.load()));$('decision-content').replaceChildren();}
      }
      updateAccount();
    }
    function saveButton(item){const saved=workspace.state.saved.includes(item.target),b=button('',()=>watch(item),'bookmark');b.append(svg('save'));b.setAttribute('aria-label',item.name+(saved?' 관심 해제':' 관심 추가'));b.setAttribute('aria-pressed',String(saved));b.disabled=workspace.busy||workspace.state.principal?.role==='viewer'||staticOnly;return b;}
    function row(item){const n=el('div',undefined,'catalogue-row'),open=button('',()=>openEntity(item),'catalogue-open'),identity=el('span');
      identity.append(el('strong',item.name,'entity-name'),el('span',item.code+' · '+item.exchange,'entity-meta'));
      open.append(el('span',item.code.replace(/[^A-Za-z0-9가-힣]/g,'').slice(0,3)||'WIE','entity-monogram'),identity,el('span',item.type,'entity-type'));n.append(open,saveButton(item));return n;}
    function renderCatalogue(){const host=$('atlas-catalogue');host.replaceChildren();$('catalogue-heading').textContent=route.q?'“'+route.q+'” 검색 결과':'탐색할 대상';
      $('atlas-save-query').hidden=!route.q;const filters=$('catalogue-filters');filters.replaceChildren();
      if(items===null){host.append(el('p',failed?'대상 목록을 불러오지 못했습니다.':'대상 목록을 불러오는 중입니다.','empty'));if(failed)host.append(button('대상 목록 다시 확인',refreshCatalogue));return;}
      const choices=['전체',...new Set(items.map(x=>x.type))];for(const name of choices){const b=button(name,()=>{filter=name;showAll=false;renderCatalogue();});b.setAttribute('aria-pressed',String(name===filter));filters.append(b);}
      let chosen=route.q?root.WIESearch.rankItems(items,route.q,{limit:50}):items;chosen=chosen.filter(x=>filter==='전체'||x.type===filter);
      $('catalogue-caption').textContent=route.q?'등록 대상 '+chosen.length+'개 · 공개 기록은 아래에서 확인하세요.':'등록 대상 '+items.length+'개 · 관측 범위는 대상마다 다릅니다.';
      for(const item of (showAll||route.q?chosen:chosen.slice(0,8)))host.append(row(item));if(!showAll&&!route.q&&chosen.length>8)host.append(button('등록 대상 '+chosen.length+'개 모두 보기',()=>{showAll=true;renderCatalogue();},'catalogue-more'));if(!chosen.length)host.append(el('p','일치하는 등록 대상이 없습니다. 다른 이름이나 코드를 입력해 보세요.','empty'));
      host.append(el('p','등록 여부는 실시간 관측이나 예측 제공을 뜻하지 않습니다.','catalogue-summary'));
    }
    function renderEntity(){const host=$('atlas-entity-content');host.replaceChildren();const item=resolveEntity(items,route.entity);
      if(!item){host.append(el('h1',items===null?'대상을 확인하고 있습니다.':'대상을 확인할 수 없습니다.'),el('p',items===null?'등록된 이름과 코드를 불러옵니다.':'등록 ID가 없거나 여러 대상과 겹칩니다. 탐색에서 정확한 대상을 다시 선택해 주세요.','empty'));if(failed)host.append(button('대상 목록 다시 확인',refreshCatalogue));return;}
      const heading=el('div',undefined,'entity-heading'),identity=el('div'),actions=el('div',undefined,'entity-actions');
      identity.append(el('span',item.type,'entity-type'),el('h1',item.name),el('p',item.code+' · '+item.exchange,'entity-meta'));
      const save=button(workspace.state.saved.includes(item.target)?'관심목록에 저장됨':'관심목록에 저장',()=>watch(item),'primary');save.setAttribute('aria-pressed',String(workspace.state.saved.includes(item.target)));save.disabled=workspace.busy||workspace.state.principal?.role==='viewer'||staticOnly;
      actions.append(save,link('Market에서 보기','/market/?entity='+encodeURIComponent(item.canonical)+'&symbol='+encodeURIComponent(item.id)));heading.append(identity,actions);host.append(heading);
      const grid=el('div',undefined,'atlas-detail-grid'),main=el('div',undefined,'entity-reading'),aside=el('aside',undefined,'atlas-companion'),view=getView(),records=entityRecords(view,item,items);
      main.append(el('h2','연결된 공개 기록'),el('p',view?'현재 공개 범위에서 이 대상과 명시적으로 연결된 관측과 예측입니다.':'공개 기록을 현재 확인할 수 없습니다. 등록된 대상 정보와 관심목록은 계속 사용할 수 있습니다.'));
      const evidence=el('div',undefined,'evidence-list');for(const r of records){const b=button('',()=>openRecord(r.id));b.append(el('strong',r.title),el('small',(r.type||'기록')+' · '+(r.status||'상태 미확인')));evidence.append(b);}main.append(evidence);
      if(!records.length)main.append(el('p',view?'현재 표시 범위에 연결된 근거가 없습니다. 자료가 없다는 사실을 변화가 없다는 뜻으로 해석하지 마세요.':'표시 기한 또는 연결 상태를 확인한 뒤 기록을 다시 불러와 주세요.','empty'),button('공개 기록 다시 확인',()=>root.WIEWorld?.load()));
      aside.append(el('h2','이 대상의 범위'),el('p','등록 대상 · 탐색 가능'),el('p','관측·예측·결과는 연결된 기록이 있을 때만 표시합니다. 시세와 수익률을 추정하지 않습니다.'),el('h3','다음 확인'),link('관측·학습 현황','/wie/status/'),link('연결된 세계 탐색','/loop'),button('내 메모 남기기',()=>navigate({view:'notes'})));
      grid.append(main,aside);host.append(grid);
    }
    function requestLogin(reason){closeMenu();loginReason=reason||'관심목록과 메모를 내 계정에 저장할 수 있습니다.';$('login-context').textContent=loginReason;updateAccount();const modal=$('atlas-login');if(modal.showModal)modal.showModal();else modal.setAttribute('open','');return false;}
    function requireAccount(reason){if(workspace.state.principal)return true;return requestLogin(reason);}
    async function watch(item){if(!workspace.state.principal){if(item.kind==='instrument')openEntity(item);else openRecord(item.id);return requestLogin('“'+item.name+'” 항목을 관심목록에 저장하고 다음에도 이어서 살펴보세요.');}const ok=await workspace.toggleSaved(item.target);updateAccount();return ok;}
    function openEntity(item){navigate({view:'home',entity:item.canonical,q:route.q||$('world-search').value.trim()});}
    function openRecord(id){if(restoring)return;route={view:'home',entity:'',focus:id,q:route.q||$('world-search').value.trim()};history?.pushState?.({wie:true},'',routeURL(route));render();}
    function updateAccount(){if(disposed)return;const state=workspace.state,member=!!state.principal;
      $('atlas-account-state').textContent=member?'내 작업공간':staticOnly?'공개 기록 열람':'공개 탐색';$('atlas-account').textContent=member?'계정 설정':'로그인';
      $('login-availability').textContent=state.loginEnabled?'Google 계정으로 본인의 작업공간을 구분합니다.':state.status==='LOADING'?'로그인 연결을 확인하고 있습니다.':'현재 로그인 연결을 사용할 수 없습니다. 공개 탐색은 계속 이용할 수 있습니다.';
      $('atlas-google-login').disabled=staticOnly||workspace.busy||!state.loginEnabled;
      if(viewName()==='home'&&items)renderCatalogue();if(viewName()==='entity'&&items)renderEntity();
      if(pendingLogin&&state.status!=='LOADING'){pendingLogin=false;requestLogin('선택한 대상을 관심목록에 저장하고 이어서 살펴보세요.');}
    }
    async function refreshCatalogue(){failed=false;try{items=await loadCatalogue();}catch{items=null;failed=true;}render();}
    function catalogue(value){items=value;failed=false;render();}
    function onPop(){closeMenu();route=readRoute(location);$('world-search').value=route.q;renderEvidence(route.q);render();}
    for(const a of d.querySelectorAll('[data-atlas-view]'))a.addEventListener('click',event=>{if(event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;event.preventDefault();navigate({view:a.dataset.atlasView});renderEvidence('');$('content')?.focus();});
    for(const id of ['atlas-back','record-back'])$(id).addEventListener('click',event=>{event.preventDefault();navigate({view:'home',q:route.q});renderEvidence(route.q);});
    $('atlas-account').addEventListener('click',()=>workspace.state.principal?navigate({view:'settings'}):requestLogin());
    $('atlas-google-login').addEventListener('click',()=>workspace.login(routeURL(route)));
    $('atlas-save-query').addEventListener('click',async()=>{if(route.q&&requireAccount('자주 찾는 검색어를 내 계정에 저장하세요.'))await workspace.addInterest(route.q);});
    eventTarget.addEventListener?.('popstate',onPop);eventTarget.addEventListener?.('hashchange',onPop);
    $('world-search').value=route.q;render();
    return {render,catalogue,refreshCatalogue,updateAccount,requestLogin,requireAccount,watch,openEntity,openRecord,
      search(q){navigate({view:'home',q});},get route(){return route;},get returnTo(){return routeURL(route);},
      destroy(){disposed=true;mobileQuery?.removeEventListener('change',menuBreakpoint);eventTarget.removeEventListener?.('keydown',menuKey);eventTarget.removeEventListener?.('popstate',onPop);eventTarget.removeEventListener?.('hashchange',onPop);}};
  }
  const api={readRoute,routeURL,resolveEntity,entityRecords,create};root.WIEAtlas=api;if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof window!=='undefined'?window:globalThis);
