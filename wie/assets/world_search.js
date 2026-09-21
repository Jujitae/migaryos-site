/* Shared deterministic navigation. A catalogue entry grants no observation,
   inference, scenario or trading authority. No LLM, telemetry or local storage. */
(function(root){
  'use strict';
  // The public explorer is hosted on GitHub Pages, while the catalogue API
  // lives on the Worker origin. Keep an explicit origin so static hosting
  // cannot accidentally turn an API request into a same-origin 404.
  const DEFAULT_API_ORIGIN='https://migaryos-world-interface.founder-685.workers.dev';
  function apiURL(path){
    const value=String(path||'');
    if(!value.startsWith('/api/'))return value;
    const origin=clean(root.WIE_WORLD_API_ORIGIN||DEFAULT_API_ORIGIN).replace(/\/$/,'');
    return origin+value;
  }
  const list=value=>Array.isArray(value)?value:[];
  const clean=value=>typeof value==='string'?value.normalize('NFC').trim():'';
  const norm=value=>clean(value).toLowerCase().replace(/\s+/g,' ');
  const kinds={equity:'주식',index:'지수',etf:'ETF',crypto:'디지털 자산',futures:'선물',fx:'환율',
    gov_bond:'국채',corp_bond:'회사채',economy:'경제 지표',entity:'대상',claim:'주장',
    observation:'관측',hypothesis:'가설',prediction:'예측',outcome:'결과',event:'사건',source:'출처'};
  const compare=(a,b)=>a===b?0:a<b?-1:1;
  function catalogueItems(registry){
    if(registry?.schema!=='migaryos.universe-registry/1'||!Array.isArray(registry.instruments)||registry.instruments.length>10000)
      throw new Error('INVALID_CATALOGUE');
    // Market resolves against raw rows and all registered lookup keys. Display
    // deduplication cannot turn multiple raw matches into a unique destination.
    const lookup=new Map();
    for(const row of registry.instruments){
      if(!row||typeof row!=='object')continue;
      const keys=new Set([row.id,row.entity_id,row.name,row.tradingview,...list(row.wie_symbols),...list(row.aliases)]
        .filter(Boolean).map(value=>norm(String(value))));
      for(const key of keys)lookup.set(key,(lookup.get(key)||0)+1);
    }
    const seen=new Set();
    return registry.instruments.flatMap(row=>{
      if(!row||!clean(row.id)||!clean(row.name)||!clean(row.entity_id))return [];
      const provider=clean(row.tradingview),split=provider.indexOf(':'),exchange=clean(row.exchange)||
        (split>0?provider.slice(0,split):clean(row.entity_id).split(':')[0]);
      const code=clean(row.symbol)||clean(row.code)||(split>0?provider.slice(split+1):clean(row.id));
      const key=JSON.stringify([row.entity_id,exchange,code,clean(row.share_class),row.asset_class]);
      if(seen.has(key))return [];seen.add(key);
      return [{key,kind:'instrument',id:row.id,target:row.entity_id,name:row.name,code,exchange,
        type:kinds[row.asset_class]||row.asset_class||'등록 대상',canonical:row.entity_id,
        canonicalMatchCount:/^[\p{L}\p{N} :&=^/!.\-]{1,80}$/u.test(row.entity_id)?lookup.get(norm(row.entity_id))||0:0,
        codes:[row.id,code,provider,row.entity_id,...list(row.wie_symbols)].filter(clean),
        names:[row.name,clean(row.name_ko),clean(row.name_en)].filter(clean),aliases:list(row.aliases).filter(clean),
        support:'탐색 가능 · 관측·예측·시나리오는 별도 확인',synthetic:row.synthetic===true,source:row}];
    });
  }
  function recordItems(records,{synthetic=false,stale=false}={}){
    return list(records).slice(0,10000).filter(row=>row&&!row.restricted&&clean(row.id)&&clean(row.title||row.name)).map(row=>({
      key:'record:'+row.id,kind:'record',id:row.id,target:row.id,name:row.title||row.name,
      code:clean(row.symbol)||row.id,canonical:clean(row.entity_id)||row.id,
      exchange:clean(row.source_id)||clean(row.source_refs?.[0]?.source_id)||'WIE',
      type:kinds[row.type]||row.type||'기록',codes:[row.id,row.symbol,row.entity_id].filter(clean),
      names:[row.title,row.name].filter(clean),aliases:list(row.aliases).filter(clean),
      support:stale||row.status==='STALE'?'지난 기록 · 현재 조건 평가 불가':'허용된 기록 · 현재 조건 평가는 별도 확인',
      synthetic:synthetic||row.synthetic===true,source:row}));
  }
  function rankItems(items,query,{limit=12}={}){
    const q=norm(query);if(!q||q.length>200)return [];
    const seen=new Set(),ranked=[];
    for(const item of list(items)){
      if(!item?.key||seen.has(item.key))continue;seen.add(item.key);
      const codes=list(item.codes).map(norm),names=list(item.names).map(norm),aliases=list(item.aliases).map(norm);
      const score=codes.includes(q)?0:names.includes(q)?1:[...codes,...names].some(x=>x.startsWith(q))?2:
        aliases.includes(q)?3:aliases.some(x=>x.startsWith(q))?4:[...codes,...names,...aliases].some(x=>x.includes(q))?5:Infinity;
      if(Number.isFinite(score))ranked.push({item,score});
    }
    return ranked.sort((a,b)=>a.score-b.score||compare(norm(a.item.name),norm(b.item.name))||compare(a.item.key,b.item.key))
      .slice(0,Math.max(1,Math.min(50,limit))).map(row=>row.item);
  }
  function highlight(document,parent,value,query){
    const text=clean(value),q=norm(query),at=q?norm(text).indexOf(q):-1;
    // Offset-changing case folds must not highlight the wrong text.
    if(at<0||norm(text).length!==text.length){parent.textContent=text;return;}
    const span=value=>{const node=document.createElement('span');node.textContent=value;return node;};
    const mark=document.createElement('mark');mark.textContent=text.slice(at,at+q.length);
    parent.append(span(text.slice(0,at)),mark,span(text.slice(at+q.length)));
  }
  function registryLoader(fetchImpl){
    let cached=null;
    return async({signal}={})=>{
      if(cached)return cached;
      const response=await fetchImpl('/market/registry.json',{credentials:'same-origin',cache:'no-store',signal});
      if(!response.ok)throw new Error(response.status===401||response.status===403?'SEARCH_AUTH_REQUIRED':'CATALOGUE_UNAVAILABLE');
      const declared=Number(response.headers?.get?.('content-length'));
      if(declared>2*1024*1024)throw new Error('INVALID_CATALOGUE');
      const text=await response.text();
      if(new TextEncoder().encode(text).length>2*1024*1024)throw new Error('INVALID_CATALOGUE');
      const items=catalogueItems(JSON.parse(text));
      if(signal?.aborted)throw new Error('ABORTED');
      cached=items;return items;
    };
  }
  function catalogueSearchLoader(fetchImpl){
    return async({query,signal}={})=>{
      const q=clean(query);if(!q)return [];
      const response=await fetchImpl(apiURL('/api/world/catalogue?q='+encodeURIComponent(q)+'&limit=12'),{credentials:'omit',cache:'no-store',signal});
      if(!response.ok)throw new Error(response.status===401||response.status===403?'SEARCH_AUTH_REQUIRED':'CATALOGUE_UNAVAILABLE');
      const data=await response.json();
      if(!data||data.schema!=='migaryos.instrument-catalogue-search/1'||!Array.isArray(data.items))throw new Error('INVALID_CATALOGUE');
      return catalogueItems({schema:'migaryos.universe-registry/1',instruments:data.items});
    };
  }
  let serial=0;
  function mount({document:d,input,host,localItems=()=>[],loadItems=null,onSelect,onWatch=null,
    saved=()=>false,watchState=()=>({}),setTimer=setTimeout,clearTimer=clearTimeout,now=()=>Date.now(),debounce=300}={}){
    if(!input||!host)return null;
    const id='wie-search-'+(++serial),el=(tag,text,cls)=>{const node=d.createElement(tag);if(text!==undefined)node.textContent=text;if(cls)node.className=cls;return node;};
    const wrap=el('div',undefined,'search-popup'),grid=el('div',undefined,'search-grid'),status=el('p','','search-feedback');
    const help=el('p','↑↓ 대상 이동 · → 관심 버튼 · Enter 실행 · Esc 닫기','search-help');help.id=id+'-help';
    grid.id=id;grid.setAttribute('role','grid');grid.setAttribute('aria-label','검색 후보');
    grid.setAttribute('aria-colcount','2');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const tools=el('div',undefined,'search-tools'),clear=el('button','지우기'),close=el('button','닫기'),retry=el('button','다시 시도');
    for(const b of [clear,close,retry])b.type='button';retry.hidden=true;tools.append(clear,retry,close);
    wrap.append(grid,status,help,tools);wrap.hidden=true;host.append(wrap);
    input.setAttribute('role','combobox');input.setAttribute('aria-autocomplete','list');input.setAttribute('aria-haspopup','grid');
    input.setAttribute('aria-controls',id);input.setAttribute('aria-expanded','false');input.setAttribute('aria-describedby',help.id);
    input.setAttribute('autocomplete','off');input.setAttribute('enterkeyhint','search');
    let items=[],remote=[],cells=[],active=-1,column=0,version=0,timer=null,abort=null,destroyed=false,composing=false,
      compositionUntil=0,watching=null,pending=false,failed=false,suppressFocus=false;
    const listeners=[];
    function listen(node,event,fn){node.addEventListener(event,fn);listeners.push([node,event,fn]);}
    const show=()=>{wrap.hidden=false;input.setAttribute('aria-expanded','true');};
    function invalidate(){version++;clearTimer(timer);timer=null;abort?.abort();abort=null;pending=false;}
    function returnFocus(){suppressFocus=true;input.focus();suppressFocus=false;}
    function closePopup(focus=false){invalidate();wrap.hidden=true;active=-1;column=0;input.setAttribute('aria-expanded','false');input.removeAttribute?.('aria-activedescendant');if(focus)returnFocus();}
    function highlightActive(){
      for(let i=0;i<cells.length;i++)for(let c=0;c<cells[i].length;c++)cells[i][c].setAttribute('aria-selected',String(i===active&&c===column));
      if(active>=0&&cells[active]?.[column]){input.setAttribute('aria-activedescendant',cells[active][column].id);cells[active][column].scrollIntoView?.({block:'nearest'});}
      else input.removeAttribute?.('aria-activedescendant');
    }
    function draw(){
      if(destroyed)return;
      items=rankItems([...localItems(),...remote],input.value);grid.replaceChildren();cells=[];
      if(active>=items.length)active=-1;
      grid.setAttribute('aria-rowcount',String(items.length));
      items.forEach((item,i)=>{
        const row=el('div',undefined,'search-result'),pickCell=el('div'),watchCell=el('div'),pick=el('button',undefined,'search-pick');
        row.setAttribute('role','row');row.setAttribute('aria-rowindex',String(i+1));
        for(const [c,cell] of [pickCell,watchCell].entries()){cell.id=id+'-'+i+'-'+c;cell.setAttribute('role','gridcell');cell.setAttribute('aria-colindex',String(c+1));}
        pick.type='button';pick.tabIndex=-1;pick.disabled=composing;
        const name=el('strong'),meta=el('span',undefined,'search-meta');highlight(d,name,item.name,input.value);
        const symbol=el('span');highlight(d,symbol,item.code,input.value);
        meta.append(symbol,el('span',item.exchange+' · '+item.type));
        pick.append(name,meta,el('small',(item.synthetic?'가상 자료 · ':'')+item.support,'search-support'));
        pick.setAttribute('aria-label',item.name+' · '+item.code+' · '+item.exchange+' · '+item.type);
        pick.addEventListener('click',()=>select(item));pickCell.append(pick);
        const watched=saved(item),state=watchState(item)||{},watch=el('button',watched?'관심 해제':'+ 관심','search-watch');
        watch.type='button';watch.tabIndex=-1;watch.setAttribute('aria-label',item.name+' · '+item.exchange+' '+(watched?'관심 해제':'관심 추가'));
        watch.setAttribute('aria-pressed',String(watched));watch.disabled=composing||watching!==null||state.busy||state.readOnly||!onWatch;
        if(state.readOnly)watch.title='읽기 전용 권한입니다.';
        if(!onWatch)watch.title='이 화면에서는 관심목록을 변경할 수 없습니다.';
        watch.addEventListener('click',()=>watchItem(item));watchCell.append(watch);row.append(pickCell,watchCell);grid.append(row);cells.push([pickCell,watchCell]);
      });
      status.textContent=failed?(items.length?'등록 목록을 확인하지 못해 현재 허용된 기록만 표시합니다. 다시 시도해 주세요.':'검색 목록을 불러오지 못했습니다. 다시 시도해 주세요.'):
        pending?(items.length?'입력과 일치하는 기록입니다. 등록 목록을 확인하고 있습니다.':'등록 목록을 확인하고 있습니다.'):
        items.length?items.length+'개 후보 · 등록 여부와 현재 분석 지원 범위는 다릅니다.':clean(input.value)?'일치하는 등록 대상이나 허용된 기록이 없습니다. 이름이나 코드를 바꿔보세요.':'이름·코드·등록 별칭을 입력하세요.';
      retry.hidden=!failed;highlightActive();
    }
    function select(item){if(composing)return;closePopup();onSelect?.(item);}
    async function watchItem(item){
      if(composing||watching!==null||!onWatch)return;
      const state=watchState(item)||{};if(state.busy||state.readOnly)return;
      watching=item.key;draw();
      try{const ok=await onWatch(item);if(destroyed)return;watching=null;draw();status.textContent=ok?(saved(item)?'관심목록에 저장했습니다.':'관심목록에서 해제했습니다.'):
        (watchState(item)?.message||'저장하지 못했습니다. 로그인·권한·연결을 확인하고 다시 시도하세요.');returnFocus();}
      catch{if(!destroyed){watching=null;draw();status.textContent='저장하지 못했습니다. 관심 상태는 변경하지 않았습니다.';returnFocus();}}
    }
    function refresh(){
      if(destroyed)return;invalidate();active=-1;column=0;failed=false;show();
      const ticket=version;pending=!!loadItems;draw();
      if(!loadItems||!clean(input.value)){pending=false;draw();return;}
      timer=setTimer(async()=>{
        timer=null;abort=new AbortController();const signal=abort.signal;
        try{const result=await loadItems({query:input.value,signal});if(destroyed||ticket!==version||signal.aborted)return;remote=list(result);pending=false;failed=false;draw();}
        catch(error){if(destroyed||ticket!==version||signal.aborted)return;remote=[];pending=false;failed=true;draw();
          if(error.message==='SEARCH_AUTH_REQUIRED')status.textContent='검색 권한을 확인할 수 없습니다. 로그인 상태를 확인하고 다시 시도하세요.';}
      },debounce);
    }
    listen(input,'input',refresh);listen(input,'focus',()=>{if(!composing&&!suppressFocus)refresh();});
    listen(input,'compositionstart',()=>{composing=true;invalidate();active=-1;column=0;draw();});
    listen(input,'compositionend',()=>{composing=false;compositionUntil=now()+180;refresh();});
    function key(event){
      if(event.isComposing||event.keyCode===229||composing)return;
      if(event.key==='Enter'&&now()<compositionUntil){event.preventDefault();return;}
      if(event.key==='Enter'&&failed&&!items.length&&!wrap.hidden){event.preventDefault();refresh();return;}
      if(event.key==='Escape'){event.preventDefault();closePopup(true);return;}
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();if(wrap.hidden)refresh();if(!items.length)return;
        active=event.key==='ArrowDown'?Math.min(active+1,items.length-1):active<0?items.length-1:Math.max(0,active-1);highlightActive();return;
      }
      if(active>=0&&!wrap.hidden&&(event.key==='ArrowRight'||event.key==='ArrowLeft')){event.preventDefault();column=event.key==='ArrowRight'?1:0;highlightActive();return;}
      if(event.key==='Enter'&&active>=0&&!wrap.hidden){event.preventDefault();column===1?void watchItem(items[active]):select(items[active]);}
      else if(event.key==='Tab')closePopup();
    }
    listen(input,'keydown',key);listen(wrap,'keydown',event=>{if(event.key==='Escape'){event.preventDefault();closePopup(true);}});
    listen(host,'focusout',event=>{if(event.relatedTarget&&!host.contains?.(event.relatedTarget)&&event.relatedTarget!==input)closePopup();});
    listen(clear,'click',()=>{input.value='';remote=[];closePopup(true);refresh();});listen(close,'click',()=>closePopup(true));listen(retry,'click',refresh);
    if(d.addEventListener)listen(d,'pointerdown',event=>{if(event.target!==input&&!host.contains?.(event.target))closePopup();});
    return {refresh,update(){if(!wrap.hidden)draw();},close:closePopup,
      reset(){closePopup();items=[];remote=[];cells=[];grid.replaceChildren();status.textContent='';},
      suppressSubmit:()=>composing||now()<compositionUntil,get results(){return items;},
      get state(){return {open:!wrap.hidden,pending,failed,active,column,version};},
      destroy(){destroyed=true;invalidate();for(const [node,event,fn] of listeners)node.removeEventListener?.(event,fn);wrap.remove?.();}};
  }
  const api={apiURL,catalogueItems,recordItems,rankItems,highlight,registryLoader,catalogueSearchLoader,mount};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WIESearch=api;
})(typeof globalThis!=='undefined'?globalThis:this);
