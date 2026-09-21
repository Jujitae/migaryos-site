/* WIE V2: API-owned evidence; text-only DOM; customer notes never mutate the model. */
(function (root) {
  'use strict';
  const workspaceModule=root.WIEWorkspace||(typeof require==='function'?require('./world_workspace.js'):null);
  const atlasModule=root.WIEAtlas||(typeof require==='function'?require('./world_atlas.js'):null);
  const searchModule=root.WIESearch||(typeof require==='function'?require('./world_search.js'):null);
  const TYPES = {prediction:'예측',outcome:'결과',journal:'관측 일기',source:'출처',analysis:'시장 관측',hypothesis:'인과 가설',claim:'관측된 주장',observation:'관측',entity:'주제 후보',event:'사건',revision:'모델 수정',learning:'학습 기록'};
  const RELATIONS = {cites:'출처 인용',recorded_outcome:'기록된 결과',same_symbol:'같은 심볼',issued_in_window:'발행 시점 기록',CO_OCCURRENCE:'함께 언급됨 · 연관 후보',MENTIONS:'언급된 주제',TEMPORAL_PRECEDENCE:'시간상 앞선 관측',CONFLICTING_CLAIMS:'엇갈리는 주장',CAUSAL_HYPOTHESIS:'인과 가설 · 미입증'};
  const CATEGORIES = ['community','research_government','news_personal','database_onion','market_society_technology_environment','claim_conflict_missing'];
  const CATEGORY_LABELS = ['커뮤니티','논문·정부·공식 기록','뉴스·현장·개인 기록','심층 DB·공개 onion','시장·사회·기술·환경','주장·소문·모순·누락'];
  const arr = x => Array.isArray(x) ? x : [];
  const str = x => typeof x === 'string' ? x : typeof x === 'number' && Number.isFinite(x) ? String(x) : '';
  const text = x => str(x) || (x && typeof x === 'object' ? str(x.statement || x.question || x.description || x.name || x.label || x.result || x.type) : '');
  const time = x => x && Number.isFinite(Date.parse(x)) ? new Date(x).toLocaleString('ko-KR', {timeZoneName:'short'}) : '미확인';
  // Projection published_at is distribution time. It cannot make old or
  // undated evidence look new; typed model rows provide their own event time.
  function recordTime(record,cutoff=Infinity){for(const key of ['as_of','issued_at','reviewed_at','observed_at','recorded_at']){const value=record[key];if(typeof value==='string'&&Number.isFinite(Date.parse(value))&&Date.parse(value)<=cutoff)return value;}return null;}
  function newest(records,cutoff){const stamp=r=>{const value=Date.parse(recordTime(r,cutoff));return Number.isFinite(value)?value:-Infinity;};return records.slice().sort((a,b)=>stamp(b)-stamp(a)||(a.id<b.id?-1:a.id>b.id?1:0));}
  const conditionText = c => typeof c === 'string' ? c : c && typeof c === 'object' ? [c.entity,c.variable,c.operator,str(c.threshold),c.unit].filter(Boolean).join(' ') : '';
  const predictionText = p => [p.selector?.entity,p.selector?.variable,p.operator,str(p.threshold),p.selector?.unit].filter(Boolean).join(' ')+' · 관측 창 '+time(p.window_start)+'–'+time(p.window_end);
  const resultText = r => (r.result||'미확인')+' · 실제 값 '+(arr(r.actual_values).length?arr(r.actual_values).map(str).join(', '):'미확인')+' · '+time(r.reviewed_at||r.recorded_at)+' · '+(r.reason||'');
  const unique = rows => [...new Map(rows.filter(x => x && str(x.id)).map(x => [x.id,x])).values()];
  const claimText = claim => text(claim.statement) || [text(claim.subject),text(claim.predicate),str(claim.value),str(claim.unit)].filter(Boolean).join(' · ');
  function selectedEdges(view,id){const row=view.byId.get(id);return view.edges.filter(e=>e.from===id||e.to===id||(row?.type==='hypothesis'&&str(row.hypothesis_id)&&e.relation==='CAUSAL_HYPOTHESIS'&&e.hypothesis_id===row.hypothesis_id));}
  function safeURL(value) { try { const u = new URL(value, 'https://local.invalid'); return (u.protocol === 'https:' || u.protocol === 'http:') && !u.username && !u.password ? (String(value).startsWith('/') && !String(value).startsWith('//') ? value : u.href) : null; } catch { return null; } }
  function normalize(payload, founder=false) {
    if (!payload || payload.schema !== (founder ? 'wie.founder-view/1':'wie.world-explorer/1')) throw new Error('INVALID_RESPONSE');
    if (!(founder ? ['OK','STALE','INPUT_UNAVAILABLE'] : ['OK','PROJECTION_STALE','MODEL_UNAVAILABLE']).includes(payload.status)) throw new Error('INVALID_RESPONSE');
    const m = payload.model;
    if (m && (m.schema !== 'wie.world-model.snapshot/1' || (!founder && m.projection !== 'PUBLIC_DISPLAYABLE'))) throw new Error('INVALID_MODEL');
    const model = m || {};
    const obs = new Map(arr(model.observations).map(o => [o.observation_id,o]));
    const record = (item,type,extra={}) => ({...item,id:item.id || item.observation_id,type,title:text(item.title || item.name || item.statement) || TYPES[type],summary:text(item.summary || item.text || item.statement),...extra});
    const records = arr(payload.records).filter(r => r && str(r.id) && !r.restricted).map(r => ({...r,source_refs:arr(r.source_refs),links:arr(r.links)}));
    for (const o of obs.values()) records.push(record(o,'observation',{id:'observation:'+o.observation_id,title:o.text || '관측',observation_ids:[o.observation_id],source_refs:arr(o.source_refs).length ? o.source_refs : [{url:o.original_locator,attribution:o.source_id}],as_of:o.observed_at}));
    for (const e of arr(model.entities)) records.push(record(e,'entity'));
    for (const e of arr(model.events)) records.push(record(e,'event',{title:obs.get(e.observation_id)?.text || '주장이 관측된 사건',observation_ids:[e.observation_id]}));
    for (const c of arr(model.claims)) records.push(record(c,'claim',{title:claimText(c)||'내용 미기록 주장',summary:claimText(c)||obs.get(c.observation_id)?.text||'',observation_ids:[c.observation_id]}));
    for (const h of arr(model.hypotheses)) records.push(record(h,'hypothesis',{title:h.proposal ? h.proposal.cause+' → '+h.proposal.effect : h.hypothesis_id,summary:h.proposal?.mechanism || ''}));
    for (const p of arr(model.predictions)) records.push(record(p,'prediction',{title:p.hypothesis_id || p.prediction_id,as_of:p.issued_at}));
    const all = unique(records).map(r=>({...r,title:str(r.title).slice(0,180)})), ids = new Set(all.map(r => r.id));
    const edges = arr(model.edges).map(e => ({...e,from:e.source,to:e.target,relation:e.type}));
    for (const r of all) for (const l of arr(r.links)) edges.push({from:r.id,to:l.to,relation:l.relation});
    return {payload,model,records:all,byId:new Map(all.map(r => [r.id,r])),edges:edges.filter(e=>ids.has(e.from)&&ids.has(e.to)),obs,founder};
  }
  function related(view, row) {
    const refs = new Set(arr(row.observation_ids));
    const h = row.proposal ? row : arr(view.model.hypotheses).find(h => h.hypothesis_id === row.hypothesis_id || arr(h.observation_ids).some(id=>refs.has(id)));
    const proposal = h?.proposal || {};
    const sameHypothesis = item => h && item.hypothesis_id === h.hypothesis_id;
    const predictions = arr(view.model.predictions).filter(sameHypothesis);
    const reviews = arr(view.model.reviews).filter(sameHypothesis);
    const revisions = arr(view.model.revisions).filter(sameHypothesis);
    const linked = selectedEdges(view,row.id).flatMap(e=>(e.from===row.id?[e.to]:e.to===row.id?[e.from]:[e.from,e.to]).map(id=>({...e,record:view.byId.get(id)})));
    const alternatives = arr(proposal.alternatives);
    const supporting = arr(proposal.supporting).map(id=>view.obs.get(id)).filter(Boolean);
    const opposing = arr(proposal.opposing).map(id=>view.obs.get(id)).filter(Boolean);
    return {hypothesis:h,proposal,predictions,reviews,revisions,linked,alternatives,supporting,opposing};
  }
  function graphSlice(view, rows, selected, connectedOnly, limit=12) {
    const allowed = new Set(rows.map(r=>r.id));
    const linked = selectedEdges(view,selected).flatMap(e=>[e.from,e.to]);
    const ranked = unique([view.byId.get(selected),...linked.map(id=>view.byId.get(id)),...rows]);
    const nodes = ranked.filter(r=>allowed.has(r.id)&&(!connectedOnly||r.id===selected||linked.includes(r.id))).slice(0,limit);
    const ids = new Set(nodes.map(n=>n.id));
    const hypothesis=view.byId.get(selected)?.type==='hypothesis'?view.byId.get(selected).hypothesis_id:null;
    return {nodes,edges:view.edges.filter(e=>ids.has(e.from)&&ids.has(e.to)&&(!hypothesis||e.relation!=='CAUSAL_HYPOTHESIS'||e.hypothesis_id===hypothesis))};
  }
  function guestStore(storage) {
    const key='migaryos.world.guest.v2';
    let state={interests:[],saved:[],notes:[]}, error=null;
    try { const raw=storage?.getItem(key); if(raw){const p=JSON.parse(raw);state={interests:arr(p.interests).filter(x=>typeof x==='string').slice(0,40),saved:arr(p.saved).filter(x=>typeof x==='string').slice(0,200),notes:arr(p.notes).filter(x=>x&&typeof x.id==='string'&&typeof x.text==='string').slice(0,100)};} } catch { error='저장된 작업공간을 읽지 못했습니다. 브라우저 저장 설정을 확인하세요.'; }
    return {get state(){return state;},get error(){return error;},update(fn){const next=structuredClone(state);fn(next);try{if(!storage)throw new Error('NO_STORAGE');storage.setItem(key,JSON.stringify(next));state=next;error=null;return true;}catch{error='저장하지 못했습니다. 브라우저 저장 공간과 권한을 확인하세요.';return false;}}};
  }
  const METHOD_LABELS={RULE_BASED:'규칙',STATISTICAL:'통계',ML:'머신러닝',DEEP_LEARNING:'딥러닝',ENSEMBLE:'앙상블'};
  const FAMILY_LABELS={stationary:'정상 발생률',recent:'최근 발생률',previous_window:'이전 관측 창',online:'온라인 학습',linear_poisson:'포아송 회귀',tree:'트리',temporal:'시계열 신경망',graph:'그래프 신경망',ensemble:'앙상블'};
  const adaptiveStatus=value=>({ISSUED:'발행됨',NOT_ISSUED:'발행 거절',MISSED:'발행 창 지남',PENDING:'대기',RESOLVED:'관측 완료',UNRESOLVED:'판정 불가'}[value]||str(value)||'미확인');
  function renderAdaptive(d,container,value,{now=Date.now,onInspect=null}={}){
    if(!container)return null;container.replaceChildren();
    const el=(tag,text,cls)=>{const n=d.createElement(tag);if(text!==undefined)n.textContent=str(text);if(cls)n.className=cls;return n;};
    const until=Date.parse(value?.valid_until),at=Date.parse(value?.as_of);
    if(value?.schema!=='wie.adaptive-founder-view/1'||value.audience!=='INTERNAL_ONLY'||
       !['READY','PARTIAL_OR_REFUSED'].includes(value.status)||!Number.isFinite(until)||until<=now()||!Number.isFinite(at)||at>now()){
      container.append(el('p','현재 학습 기록의 권한·완료 근거·유효 시각을 확인할 수 없습니다. 연결을 다시 확인해 주세요.','empty'));return null;
    }
    container.append(el('p','학습 기록 기준 '+time(value.as_of)+' · 표시 기한 '+time(value.valid_until),'muted'),
      el('p','실제 학습과 예측 발행을 기록합니다. 성능 개선·물리적 인과·자동승격은 입증되지 않았습니다.','adaptive-boundary'));
    for(const entry of arr(value.entries).slice(0,8)){
      const projection=entry.projection;
      if(projection?.status!=='READY'){container.append(el('p','이 실험의 완료 근거를 현재 검증할 수 없습니다.','empty'));continue;}
      const connected=entry.connected_case?.projection;
      if(connected&&connected.status!=='READY')container.append(el('p','이 실험에 연결된 연구 과정의 근거를 확인하지 못했습니다. 아래 예측 기록과 구분해 보세요.','empty'));
      if(connected?.status==='READY')for(const record of arr(connected.cases)){
        const box=el('details',undefined,'adaptive-provenance');box.append(el('summary','이 사례가 연구로 이어진 과정 · 규칙 기반 구조 해석'));
        const names={CASE_SOURCE_INTERPRETED:'출처의 개체·시간·단위 해석',CASE_GAP_DISCOVERED:'관측이 빠진 구간 발견',CASE_RESEARCH_SELECTED:'보완 관측 선택',CASE_RESEARCH_OBSERVED:'선택한 출처 실제 관측',CASE_RESEARCH_FAILED:'관측 실패'};
        for(const stage of arr(record.stages)){
          box.append(el('p',(names[stage.kind]||stage.kind)+' · '+time(stage.recorded_at)));
          if(stage.question==='MEASURE_UNOBSERVED_CATALOG_PREFIX')box.append(el('p','확인할 질문: 빠진 시간 구간의 출처 관측을 보완할 수 있는가?'));
          if(stage.catalog)box.append(el('p','조회 범위 '+time(stage.catalog.query_start)+'–'+time(stage.catalog.query_end)+' · 출처가 보고한 기록 '+str(stage.catalog.reported_claims)+'건'));
          if(stage.coverage?.status==='RECORDED_INPUT_COVERAGE')box.append(el('p','입력에 필요한 24시간 중 관측 '+str(stage.coverage.observed_hours)+'시간 · 미관측 '+str(stage.coverage.missing_hours)+'시간. 미관측을 사건 0건으로 계산하지 않습니다.'));
          const purposes={EXTEND_RECORDED_PREFIX:'빠진 구간까지 조회 범위 확장',RECHECK_RECORDED_PREFIX:'이미 관측한 범위 다시 확인'};
          for(const choice of arr(stage.choices))box.append(el('p',(choice.selected?'선택: ':'비선택: ')+(purposes[choice.purpose]||'기록된 다른 조회')));
          if(stage.selection_basis==='DECLARED_MISSING_HOUR_PROXY_NOT_MEASURED_UTILITY')box.append(el('p','선택 기준은 보완 가능한 시간 구간입니다. 예측 성능 개선을 측정한 값은 아닙니다.','muted'));
          box.append(el('p','근거 '+str(stage.event_hash),'evidence-hash'));
        }
        box.append(el('p','구조화된 출처 필드의 연결이며 일반 문장 이해나 연구 선택의 성능 개선을 입증하지 않습니다.','muted'));container.append(box);
      }
      if(projection.source_inventory)container.append(el('p','검사한 출처 연결 '+str(projection.source_inventory.total)+'개 · 전체 목록 식별값 '+str(projection.source_inventory.sha256),'evidence-hash'));
      for(const epoch of arr(projection.epochs)){
        const section=el('section',undefined,'adaptive-epoch');section.append(el('h3','관측 창 시작 '+time(epoch.start_at)),
          el('p',(epoch.data_kind==='REAL'?'실제 출처 자료':'합성 자료')+' · 결과 관측 '+str(epoch.outcomes?.resolved)+' / '+str(epoch.outcomes?.denominator)+
            ' · 대기 '+str(epoch.outcomes?.pending)+' · 판정 불가 '+str(epoch.outcomes?.unresolved),'muted'));
        const scroll=el('div',undefined,'adaptive-table-scroll');scroll.setAttribute('tabindex','0');scroll.setAttribute('aria-label','학습 계층별 발행과 결과 표');
        const table=el('table',undefined,'adaptive-table'),head=el('thead'),row=el('tr');
        for(const label of ['학습 계층','방법','1시간 예측','6시간 예측','근거'])row.append(el('th',label));head.append(row);table.append(head);const body=el('tbody');
        for(const family of arr(epoch.families)){
          const tr=el('tr');tr.append(el('th',FAMILY_LABELS[family.family]||family.family),el('td',METHOD_LABELS[family.method]||family.method));
          for(const h of [1,6]){const p=arr(family.opportunities).find(x=>x.horizon_hours===h);tr.append(el('td',p?adaptiveStatus(p.status)+(p.status==='ISSUED'&&Number.isFinite(p.value)?' · '+p.value.toFixed(3)+'건':''):'기록 없음'));}
          const cell=el('td'),inspect=el('button','Lens에서 보기');inspect.type='button';inspect.disabled=!onInspect;
          inspect.addEventListener('click',()=>onInspect?.({family,epoch,projection,authority:entry.completed_authority}));cell.append(inspect);tr.append(cell);body.append(tr);
        }
        table.append(body);scroll.append(table);section.append(scroll);
        if(!arr(epoch.families).length)section.append(el('p','아직 발행된 모델 묶음이 없습니다.','empty'));
        for(const update of arr(epoch.updates))section.append(el('p','실제 결과로 모델 파라미터 갱신 · 변화량 '+str(update.parameter_change_l2)+' · 자동승격 없음','adaptive-update'));
        for(const window of arr(entry.capture_windows))section.append(el('p','고정 결과 수집 창 '+time(window.due_at)+' · 허용 지연 '+str(window.max_lateness_seconds)+'초','muted'));
        container.append(section);
      }
    }
    const details=el('details',undefined,'adaptive-provenance');details.append(el('summary','자료 연결 확인'),
      el('p','이 학습 기록 생성에 참조한 기존 자료 시각 '+time(value.legacy_parent_as_of)),
      el('p','기존 자료 묶음 SHA-256 '+str(value.legacy_parent_manifest_sha256),'evidence-hash'));
    container.append(details);return until;
  }
  function createApp({document:d,fetchImpl,storage=null,location={hash:''},history=root.history,eventTarget=root,founder=false,now=()=>Date.now(),setTimer=setTimeout,clearTimer=clearTimeout}={}) {
    const isAtlas=!founder&&d.body?.dataset.worldShell==='atlas';
    let atlas=null;
    const staticOnly=!founder&&d.body?.dataset.worldDelivery==='STATIC_READ_ONLY';
    const $=id=>d.getElementById(id), el=(tag,value,cls)=>{const n=d.createElement(tag);if(value!==undefined)n.textContent=str(value);if(cls)n.className=cls;return n;};
    const append=(id,...nodes)=>{const n=$(id);if(n)n.append(...nodes);};
    const clear=id=>{const n=$(id);if(n)n.replaceChildren();};
    const button=(label,fn,cls)=>{const b=el('button',label,cls);b.type='button';b.addEventListener('click',fn);return b;};
    const empty=message=>el('p',message,'empty');
    let view=null,selected=null,query='',limit=20,loadId=0,expiryTimer=null,chatId=0;
    let saveAction=null,adaptiveTimer=null,adaptiveLensActive=false,searchBox=null;
    let reloadTimer=null,requestController=null,evidenceBusy=false,evidenceDeadline=null,revalidateOnReturn=false;
    let evidenceState='loading';
    let activeLensTab='영향과 조건',lensRecord=null,questionDraft={id:null,text:''},noteDraft=null;
    let catalogue=null,cataloguePending=null,catalogueFailed=false,destroyed=false;
    const registryLoader=searchModule.registryLoader(fetchImpl);
    const remoteCatalogueSearch=searchModule.catalogueSearchLoader(fetchImpl);
    const mergeCatalogue=(base,extra)=>{const rows=[...(base||[])];for(const item of extra||[]){if(!item?.canonical||rows.some(row=>row.canonical===item.canonical))continue;rows.push(item);}return rows;};
    async function loadCatalogue(options){const items=await registryLoader(options);
      let merged=items;
      if(isAtlas&&atlas?.route.entity&&!items.some(item=>item.canonical===atlas.route.entity)){
        try{
          const response=await fetchImpl('/api/world/catalogue/'+encodeURIComponent(atlas.route.entity),{credentials:'same-origin',cache:'no-store'});
          const data=response.ok?await response.json():null;
          if(data?.schema==='migaryos.instrument-catalogue-detail/1'&&data.status==='OK')
            merged=mergeCatalogue(items,searchModule.catalogueItems({schema:'migaryos.universe-registry/1',instruments:[data.item]}));
        }catch{/* direct remote detail is optional; static catalogue remains available */}
      }
      if(!destroyed){catalogue=merged;catalogueFailed=false;atlas?.catalogue(merged);renderWorkspace();}return merged;}
    async function loadSearchItems(options){
      const local=catalogue||await loadCatalogue();
      const remote=await remoteCatalogueSearch(options);
      const merged=mergeCatalogue(local,remote);
      if(!destroyed){catalogue=merged;atlas?.catalogue(merged);}
      return merged;
    }
    const legacy=guestStore(storage);
    const workspace=founder?null:workspaceModule.createWorkspace({fetchImpl,now,setTimer,clearTimer,staticOnly,onChange:()=>renderWorkspace()});
    const session=root.crypto?.randomUUID?.() || 'guest-'+String(now())+'-'+Math.random().toString(36).slice(2);
    function status(message,cls=''){const n=$('world-status');if(n){n.textContent=message;n.className=cls;}}
    function link(label,url){if(staticOnly&&url.startsWith('/founder/'))return el('span',label+' · 비공개 서버에서 제공','private-unavailable');const a=el('a',label);a.href=url;return a;}
    function fieldList(parent,entries){const dl=el('dl');for(const [label,value] of entries){dl.append(el('dt',label),el('dd',value||'미확인'));}parent.append(dl);}
    function section(parent,title,values,missing){const box=el('section',undefined,'lens-section');box.append(el('h3',title));const data=arr(values).map(text).filter(Boolean);if(data.length){const ul=el('ul');for(const item of data)ul.append(el('li',item));box.append(ul);}else box.append(empty(missing));parent.append(box);return box;}
    function rows(){return view ? newest(view.records.filter(r=>(str(r.title)+' '+str(r.summary)+' '+str(r.content)+' '+str(r.symbol)).toLocaleLowerCase().includes(query.toLocaleLowerCase())),now()):[];}
    function focus(id,move=true){if(!view?.byId.has(id))return;selected=id;if(atlas)atlas.openRecord(id);renderMap();renderLens();renderRecords();if(move){$('lens-content')?.setAttribute('tabindex','-1');$('lens-content')?.focus();}if(!founder && !isAtlas && location)location.hash='focus='+encodeURIComponent(id);}
    function renderCards(){clear('change-cards');$('change-cards')?.setAttribute('aria-busy','false');if(!view)return;
      if(founder){const m=view.model;for(const [title,key,desc] of [['새로 연결된 사건','changed_world_candidates','검토가 필요한 변화 후보'],['경쟁하는 설명','hypotheses','등록된 인과 가설 · 미입증'],['수정된 모델','revisions','남겨진 모델 버전'],['아직 모르는 영역','unresolved_gaps','추가 관측이 필요한 질문']]){const box=el('div',undefined,'change-card');box.append(el('span',title,'change-label'),el('strong',arr(m[key]).length+'건'),el('p','현재 표시 범위 · '+desc));append('change-cards',box);}return;}
      const chosen=rows().filter(r=>r.type!=='source').slice(0,3);
      if(!chosen.length){append('change-cards',empty(query?'검색어와 맞는 공개 기록이 없습니다. 다른 주제로 찾아보세요.':'공개 가능한 변화 기록이 아직 없습니다. 자료 없음은 변화가 없었다는 뜻이 아닙니다.'));return;}
      const today=new Date(now());today.setHours(0,0,0,0);if(!recordTime(chosen[0],now())||Date.parse(recordTime(chosen[0],now()))<today.getTime())append('change-cards',el('p','오늘 시각의 새 기록이 없어 과거·시각 미확인 기록을 표시합니다.','change-summary'));
      for(const r of chosen){const b=button('',()=>focus(r.id),'change-card');b.append(el('span',TYPES[r.type]||'공개 기록','change-label'),el('strong',r.title),el('p',r.summary&&r.summary!==r.title?r.summary:'기록을 열어 관측과 근거를 확인하세요.'),el('span','기록 시각 '+time(recordTime(r,now()))+' · '+(r.status||'상태 미확인'),'change-date'));append('change-cards',b);}
    }
    function renderMap(){clear('world-map');clear('map-relations');if(!view)return;const slice=graphSlice(view,rows(),selected,!!$('connected-only')?.checked);if(!slice.nodes.length){append('world-map',empty('현재 범위에서 연결할 수 있는 기록이 없습니다. 검색어나 공개 범위를 확인하세요.'));return;}
      const positions=new Map();const count=slice.nodes.length;
      // Stable rows avoid force-layout jitter; lines mean supplied relations only.
      slice.nodes.forEach((r,i)=>positions.set(r.id,{x:count===1?50:18+(i%3)*32,y:count<=3?48:16+Math.floor(i/3)*(68/Math.max(1,Math.ceil(count/3)-1))}));
      const svg=d.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-hidden','true');
      for(const edge of slice.edges){const a=positions.get(edge.from),b=positions.get(edge.to);const l=d.createElementNS('http://www.w3.org/2000/svg','line');for(const [k,v] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y}))l.setAttribute(k,String(v));l.setAttribute('vector-effect','non-scaling-stroke');l.setAttribute('class','graph-edge'+(edge.relation==='CAUSAL_HYPOTHESIS'?' is-hypothesis':'')+(selectedEdges(view,selected).includes(edge)?' is-selected':''));svg.append(l);}append('world-map',svg);
      for(const r of slice.nodes){const b=button('',()=>focus(r.id),'graph-node'+(r.type==='hypothesis'?' is-hypothesis':''));b.setAttribute('aria-label',(TYPES[r.type]||'기록')+' · '+r.title);b.setAttribute('aria-pressed',String(r.id===selected));b.title=r.title;const p=positions.get(r.id);b.style.left=p.x+'%';b.style.top=p.y+'%';b.append(el('span','','node-dot'),el('span',r.title,'node-label'));append('world-map',b);}
      append('map-relations',el('p',`검색 범위 ${rows().length}건 중 ${slice.nodes.length}개 점 표시 · 연결은 인과 입증이 아닙니다.`,'muted'));
      const relevant=selectedEdges(view,selected);
      if(selected&&!relevant.length)append('map-relations',empty('선택한 기록에 등록된 연결이 없습니다. 화면의 거리로 관계를 추정하지 않습니다.'));
      for(const e of relevant.slice(0,12)){const row=el('div',undefined,'relation-row');row.append(button(view.byId.get(e.from).title,()=>focus(e.from)),el('span','→ '+(RELATIONS[e.relation]||e.relation)+' →'),button(view.byId.get(e.to).title,()=>focus(e.to)));append('map-relations',row);}
      if(relevant.length>12)append('map-relations',el('p','연결 '+relevant.length+'건 중 12건 표시. 연결된 점을 선택해 계속 탐색하세요.','muted'));
    }
    function renderRecords(){clear('record-list');if(!view){
      if(isAtlas){const loading=evidenceState==='loading',expired=evidenceState==='expired';
        if($('record-count'))$('record-count').textContent=loading?'확인 중':expired?'표시 기한 지남':'현재 확인 불가';
        append('record-list',empty(loading?'공개 기록을 확인하고 있습니다.':expired?
          '표시 유효 기한이 지났습니다. 공개 기록을 다시 확인해 주세요.':
          '공개 기록을 확인하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.'));
        if(!loading)append('record-list',button('공개 기록 다시 확인',()=>load()));
        if($('more-records'))$('more-records').hidden=true;
      }return;
    }const data=rows();if($('record-count'))$('record-count').textContent=(founder?'표시 범위의 검색 결과 ':'')+data.length+'건';if(!data.length)append('record-list',empty('일치하는 기록이 없습니다. 검색어를 바꾸거나 다시 불러오세요.'));for(const r of data.slice(0,limit)){const row=el('div',undefined,'record-row');const b=button('',()=>focus(r.id));b.setAttribute('aria-pressed',String(r.id===selected));b.append(el('strong',r.title),el('p',(TYPES[r.type]||r.type)+' · '+(r.status||'상태 미확인')));row.append(b,el('time',time(r.as_of||r.observed_at||r.recorded_at)));append('record-list',row);}if($('more-records'))$('more-records').hidden=data.length<=limit;}
    function renderLens(){if(lensRecord!==selected){activeLensTab='영향과 조건';lensRecord=selected;}adaptiveLensActive=false;clear('lens-content');chatId++;if(!view||!selected)return;const r=view.byId.get(selected);if(!r)return;const rel=related(view,r),parent=$('lens-content');if(!parent)return;
      const nextQuestion=rel.hypothesis?.next_question||text(arr(rel.proposal.falsifiers)[0])||'관측 시각과 원문 근거를 확인하세요. 행동을 판단할 조건은 아직 등록되지 않았습니다.';
      const rail=$('decision-content');if(rail){rail.replaceChildren();const summary=el('section',undefined,'rail-section');
        summary.append(el('h3','현재 기록의 상태'),el('p',r.status||'판정 상태 미확인'));
        fieldList(summary,[['대상 유형',TYPES[r.type]||r.type],['자료 구분',r.synthetic||view.model.synthetic?'가상 자료':'허용된 기록'],
          ['현재 조건 평가','별도 확인 필요'],['주문 실행','지원하지 않음']]);
        const next=el('section',undefined,'rail-section');next.append(el('h3','다음 확인'),
          el('p',nextQuestion),
          ...(founder?[link('조건부 시나리오 · 비공개','/founder/?scenario_focus='+encodeURIComponent(r.id)+'#private-scenarios')]:[]),
          link('학습·실험 비교','/quant/?focus='+encodeURIComponent(r.id)+'#adaptive-audit'));rail.append(summary,next);}
      parent.append(el('h2',r.title,'lens-title'),el('span',TYPES[r.type]||r.type,'badge'),el('span',r.synthetic||view.model.synthetic?'합성 자료 · 실세계 증거 아님':r.status||'상태 미확인','badge hypothesis'));
      if(r.type==='claim'||r.type==='event')parent.append(el('p','이 주장이 관측됐다는 기록이며, 내용이 참이라는 확인은 아닙니다.','muted'));
      parent.append(el('p',r.summary||r.content||'현재 기록에 별도 요약이 없습니다.','lens-summary'));
      const mobileDecision=el('section',undefined,'mobile-decision');mobileDecision.append(el('h3','현재 판단 · '+(r.status||'미확인')),el('p','현재 조건은 별도 확인이 필요합니다.'),el('h3','다음 확인'),el('p',nextQuestion));parent.append(mobileDecision);
      const tabs=el('div',undefined,'lens-tabs');tabs.setAttribute('role','group');tabs.setAttribute('aria-label','Lens 내용 선택');parent.append(tabs);const panes=[];
      function pane(title){const box=el('div');const b=button(title,()=>{activeLensTab=title;for(const p of panes){p.box.hidden=p.box!==box;p.button.setAttribute('aria-pressed',String(p.box===box));}});b.setAttribute('aria-pressed',String(title===activeLensTab));box.hidden=title!==activeLensTab;panes.push({box,button:b});tabs.append(b);parent.append(box);return box;}
      const impact=pane('영향과 조건');const about=section(impact,'지금 확인한 것',[r.content||r.summary],'공개된 본문이 없습니다.');fieldList(about,[['기준 시각',time(r.as_of||r.observed_at||r.recorded_at)],['유효 기한',time(r.valid_until||r.expires_at)],['기록 ID',r.id],['관계 의미','연관·설명 후보 · 인과 미입증']]);
      const conditions=[['설명하는 과정',[rel.proposal.mechanism],'등록된 전달 과정이 없습니다.'],['성립 조건',arr(rel.proposal.conditions).map(conditionText),'명시된 성립 조건이 없습니다.'],['틀렸다고 판단할 조건',rel.proposal.falsifiers,'반증 조건이 등록되지 않았습니다. 이 상태를 검증 완료로 보지 않습니다.'],['아직 모르는 것',rel.proposal.missing_variables,'추가로 확인할 변수가 이 기록에 명시되지 않았습니다.']];
      const missing=el('details',undefined,'missing-conditions');missing.append(el('summary','등록되지 않은 판단 조건'));
      for(const [title,values,message] of conditions){if(arr(values).map(text).some(Boolean))section(impact,title,values,message);else missing.append(el('p',title+' · '+message));}
      if(missing.children.length>1){impact.append(el('p','판단 조건이 모두 갖춰지지 않았습니다. 현재 행동을 확정할 수 없습니다.','condition-notice'),missing);}
      if(arr(rel.proposal.lag_hours).length)section(impact,'예상 시간 지연',[rel.proposal.lag_hours.join('–')+'시간 · 가설에 명시된 범위'],'');
      const evidence=pane('근거');section(evidence,'지지 관측',rel.supporting.map(o=>o.text),'등록된 지지 관측이 없습니다.');section(evidence,'반대 관측',rel.opposing.map(o=>o.text),'등록된 반대 관측이 없습니다. 반대 근거가 없다는 입증은 아닙니다.');const sources=section(evidence,'출처와 귀속',[],'출처는 아래 공개 링크와 기록 연결로 확인합니다.');const refs=[...arr(r.source_refs),...[...rel.supporting,...rel.opposing,...arr(r.observation_ids).map(id=>view.obs.get(id)).filter(Boolean)].flatMap(o=>arr(o.source_refs).length?o.source_refs:[{url:o.original_locator,attribution:o.source_id}])];let sourceCount=0;for(const ref of refs){const href=safeURL(ref?.url);if(!href)continue;const a=link(ref.attribution||ref.source_id||'원문 출처',href);a.className='source-link';a.target='_blank';a.rel='noopener noreferrer';sources.append(a);if(ref.observed_at)sources.append(el('p','관측 '+time(ref.observed_at),'muted'));sourceCount++;}if(!sourceCount)sources.append(empty('이 기록에 열 수 있는 출처 링크가 없습니다.'));
      for(const e of rel.linked){const b=button((RELATIONS[e.relation]||e.relation)+' · '+e.record.title,()=>focus(e.record.id));sources.append(b);}
      const alternatives=pane('다른 설명');section(alternatives,'경쟁하는 가설',rel.alternatives,'명시된 대안 가설이 없습니다. 다른 설명이 배제된 것은 아닙니다.');for(const other of arr(view.model.hypotheses).filter(h=>h.id!==rel.hypothesis?.id&&arr(h.observation_ids).some(id=>arr(r.observation_ids).includes(id)))) alternatives.append(button('관련 가설 · '+(other.proposal?.cause||other.hypothesis_id)+' → '+(other.proposal?.effect||'결과 미정'),()=>focus(other.id)));if(rel.hypothesis?.next_question)section(alternatives,'다음 조사 질문',[rel.hypothesis.next_question],'');
      const history=pane('예측 이력');section(history,'예측 발행',rel.predictions.map(p=>predictionText(p)+' · 발행 '+time(p.issued_at)),'연결된 모델 예측 발행 기록이 없습니다.');if(r.type==='prediction'){const p=section(history,'이 기록의 예측',[r.selector?predictionText(r):r.content||r.summary],'기록 내용 없음');fieldList(p,[['발행',time(r.issued_at||r.as_of)],['만기',time(r.valid_until||r.expires_at||r.window_end)],['등록 확률',typeof r.probability==='number'&&Number.isFinite(r.probability)?(100*r.probability).toFixed(1)+'% · 등록값, 예측력 증거 아님':'미확인']]);}section(history,'결과 관측',[...rel.reviews.map(x=>resultText(x)),...rel.linked.filter(e=>e.relation==='recorded_outcome').map(e=>e.record.summary||e.record.title)],r.outcome?str(r.outcome):'연결된 결과 관측이 없습니다. 미확정은 실패가 아닙니다.');section(history,'판단을 바꾼 이유',rel.revisions.map(x=>(x.reason||x.status||'모델 버전')+' · '+time(x.recorded_at)),'연결된 수정 이력이 없습니다.');
      const actions=el('div',undefined,'lens-actions');if(!founder){saveAction=button(isAtlas?(workspace.state.saved.includes(r.id)?'관심목록에 저장됨':'관심목록에 저장'):(workspace.state.saved.includes(r.id)?'저장 해제':'관심 판단 저장'),async()=>{if(atlas&&!atlas.requireAccount('이 기록을 관심목록에 저장하고 다시 살펴보세요.'))return;await workspace.toggleSaved(r.id);renderWorkspace();});saveAction.disabled=staticOnly||workspace.busy||workspace.state.principal?.role==='viewer';actions.append(saveAction);}actions.append(link(r.symbol?'Market에서 '+r.symbol+' 보기':'Market 탐색',r.symbol?'/market/?symbol='+encodeURIComponent(r.symbol):'/market/'),link(founder?'Quant 자료 연구':'Quant에서 가설 검토',founder?'/quant/#research':'/quant/?focus='+encodeURIComponent(r.id)+'#research'));
      if(founder)actions.append(button('연결된 시나리오 보기',()=>root.WIEScenarios?.focus(r.id)));

      parent.append(actions);if(!founder)renderChat(parent,r);
    }
    function renderChat(parent,r){
      if(staticOnly){parent.append(el('p','공개 기록 열람 모드 · 대화와 저장은 서버 연결 후 사용할 수 있습니다.','empty'));return;}
      const form=el('form',undefined,'chat-form'),label=el('label','이 기록에 대해 묻기');label.htmlFor='lens-question';
      const input=el('input');input.id='lens-question';input.maxLength=500;input.required=true;input.placeholder='다른 원인일 가능성은?';input.value=questionDraft.id===r.id?questionDraft.text:'';input.addEventListener('input',()=>{questionDraft={id:r.id,text:input.value};});
      const b=el('button','묻기');b.type='submit';const answer=el('p','','chat-answer');answer.setAttribute('role','status');answer.setAttribute('aria-live','polite');
      let returned=null,asked='';const save=button('이 대화 저장',async()=>{if(atlas&&!atlas.requireAccount('직접 선택한 대화를 내 계정에 보관하세요.'))return;if(returned)await workspace.saveConversation(asked,returned);});save.hidden=true;
      form.append(label,input,b,el('p','공개 기록에 근거한 설명입니다. 생성된 문장은 증거가 아닙니다.','muted'),answer,save,
        el('p','대화는 자동 저장되지 않습니다. 내 작업공간에서 저장에 동의한 뒤 원하는 대화만 직접 저장할 수 있습니다.','muted'));
      form.addEventListener('submit',async event=>{event.preventDefault();const question=input.value.trim();if(!question)return;
        const ticket=++chatId;b.disabled=true;save.hidden=true;returned=null;answer.textContent='공개 근거를 확인하고 있습니다.';
        try{const response=await fetchImpl('/api/world/chat',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({question,focus:r.id,session})});
          const data=await response.json();if(ticket!==chatId)return;if(!response.ok||!['OK','NO_EVIDENCE','PROJECTION_STALE','BUDGET_EXHAUSTED'].includes(data.status))throw new Error('CHAT_UNAVAILABLE');
          answer.textContent=(data.answer||data.text||'확인할 공개 근거가 없습니다.')+'\n'+(data.llm==='USED'?'모델이 문장을 다듬었습니다 · GENERATED':'결정론 응답 · LLM 미사용')+'\n기준 시각 '+time(data.as_of);
          returned=data;asked=question;save.hidden=data.intent==='FOCUSED_MODEL_RECORD';save.disabled=workspace.state.principal?.role==='viewer';
          if(save.hidden)answer.textContent+='\n이 모델 답변은 보관 권한을 확인할 수 없어 대화로 저장할 수 없습니다. 관심 판단은 기록 ID로 저장할 수 있습니다.';
        }catch{if(ticket===chatId)answer.textContent='설명 서버에 연결하지 못했습니다. Lens의 원문 근거를 확인하거나 다시 시도하세요.';}finally{b.disabled=false;}});parent.append(form);
    }
    function renderWorkspace(){
      searchBox?.update();
      if(founder)return;
      atlas?.updateAccount();
      const state=workspace.state,viewer=state.principal?.role==='viewer',locked=workspace.busy||viewer||staticOnly;
      function workspaceEmpty(id,normal){
        if(!isAtlas||state.status==='AUTHENTICATED'){append(id,empty(normal));return;}
        const unavailable=state.status==='UNAVAILABLE';
        append(id,empty(unavailable?'저장 내역을 확인하지 못했습니다. 잠시 후 다시 확인해 주세요.':
          state.status==='LOADING'?'저장 내역을 확인하고 있습니다.':
          state.status==='STATIC_READ_ONLY'?'공개 기록 열람 모드입니다. 저장 내역은 서버 연결 후 확인할 수 있습니다.':
          '로그인하면 내 계정에 저장한 내용을 확인할 수 있습니다.'));
        if(unavailable){const retry=button('저장 내역 다시 확인',()=>workspace.refresh());retry.disabled=workspace.busy;append(id,retry);}
      }
      const draftOwner=state.principal?JSON.stringify([state.principal.user_id,state.principal.workspace_id]):null;
      if(noteDraft&&((draftOwner&&noteDraft.owner!==draftOwner)||(!draftOwner&&state.status!=='LOADING')))noteDraft=null;
      if(!destroyed&&!staticOnly&&catalogue===null&&!cataloguePending&&state.saved.some(id=>!view?.byId.has(id)))
        cataloguePending=loadCatalogue().catch(()=>{catalogue=[];catalogueFailed=true;if(!destroyed)renderWorkspace();})
          .finally(()=>{cataloguePending=null;});
      for(const id of ['interest-list','saved-list','note-list','conversation-list','watchlist-select'])clear(id);
      if($('workspace-status'))$('workspace-status').textContent=state.message||'';
      if($('workspace-identity'))$('workspace-identity').textContent=staticOnly?'STATIC_READ_ONLY · 로그인 서버 미연결':state.principal?
        (state.syntheticOnly?'합성 계정 · ':'내 계정 · ')+state.principal.plan+' · '+(viewer?'읽기 전용':'서버 저장'):
        isAtlas&&state.status==='UNAVAILABLE'?'계정과 저장 상태를 다시 확인해 주세요.':
        isAtlas&&state.status==='LOADING'?'계정 상태를 확인하고 있습니다.':
        state.loginEnabled?'로그인 후 서버에 저장합니다.':'로그인 후 서버에 저장합니다. 현재 실제 로그인은 미활성입니다.';
      if($('workspace-login')){$('workspace-login').hidden=staticOnly||!state.loginEnabled||!!state.principal;$('workspace-login').disabled=workspace.busy;}
      if($('workspace-logout'))$('workspace-logout').hidden=!state.principal;
      for(const id of ['note-input','note-submit','interest-input','interest-submit','workspace-preferences-save','conversation-opt-in','conversation-retention','workspace-persona','conversation-delete-all'])if($(id))$(id).disabled=locked;
      if(saveAction){saveAction.disabled=locked;saveAction.textContent=isAtlas?(state.saved.includes(selected)?'관심목록에 저장됨':'관심목록에 저장'):(state.saved.includes(selected)?'저장 해제':'관심 판단 저장');}
      for(const list of state.watchlists){const option=el('option',list.payload?.name||'관심목록');option.value=list.id;append('watchlist-select',option);}
      if($('watchlist-select')){$('watchlist-select').value=state.activeList||'';$('watchlist-select').disabled=workspace.busy||!state.watchlists.length;}
      if($('watchlist-limit'))$('watchlist-limit').textContent=state.principal?'선택 목록 '+state.saved.length+' / '+state.limits.watchlist_targets+'개':'Free 로그인 계정의 관심목록은 1개, 대상은 30개까지입니다.';
      for(const topic of state.interests){append('interest-list',button(topic.question,()=>{$('world-search').value=topic.question;query=topic.question;atlas?.search(query);render();$('content')?.focus();}));
        const del=button('삭제',()=>workspace.removeInterest(topic.id));del.disabled=locked;del.setAttribute('aria-label',topic.question+' 관심 주제 삭제');append('interest-list',del);}
      if(!state.interests.length)workspaceEmpty('interest-list',isAtlas?'저장한 검색어가 없습니다. 탐색에서 자주 찾는 검색어를 저장할 수 있습니다.':'로그인 후 자주 찾는 검색어를 저장할 수 있습니다.');
      for(const id of state.saved){const row=el('div',undefined,'workspace-entry'),record=view?.byId.get(id);
        const matches=arr(catalogue).filter(item=>item.canonical===id),instrument=!record&&matches.length===1&&matches[0].canonicalMatchCount===1?matches[0]:null;
        const open=instrument?(atlas?button(instrument.name+' · '+instrument.code+' · '+instrument.exchange,()=>atlas.openEntity(instrument)):link(instrument.name+' · '+instrument.code+' · '+instrument.exchange,
          '/market/?entity='+encodeURIComponent(instrument.canonical)+'&symbol='+encodeURIComponent(instrument.id))):
          button(record?.title||(catalogueFailed?'대상 목록 확인 실패 · 새로고침해 주세요':'현재 공개 범위에서 확인할 수 없는 저장 기록'),()=>focus(id));
        if(!instrument)open.disabled=!record;
        row.append(open);if(instrument)row.append(el('p',instrument.support,'muted'));
        const del=button('삭제',()=>workspace.toggleSaved(id));del.disabled=locked;row.append(del);append('saved-list',row);}
      if(!state.saved.length)workspaceEmpty('saved-list',isAtlas?'저장한 대상과 기록이 없습니다. 대상을 찾은 뒤 북마크나 ‘관심목록에 저장’을 누르면 이곳에서 다시 볼 수 있습니다.':'Lens에서 관심 판단 저장을 누르면 로그인한 작업공간에 기록 ID를 저장합니다. 원문은 복제하지 않습니다.');
      for(const note of state.notes){
        const row=el('div',undefined,'workspace-entry'),del=button('삭제',()=>workspace.removeNote(note.id));del.disabled=locked;
        function editor(){
          if(!noteDraft||noteDraft.id!==note.id)noteDraft={id:note.id,text:note.text,owner:draftOwner};
          const form=el('form'),input=el('textarea'),save=el('button','수정 저장');input.value=noteDraft.text;input.maxLength=2000;input.required=true;input.setAttribute('aria-label','메모 수정');save.type='submit';save.disabled=locked;input.disabled=locked;
          input.addEventListener('input',()=>{if(noteDraft?.id===note.id)noteDraft.text=input.value;});
          form.append(input,save,button('취소',()=>{noteDraft=null;renderWorkspace();}));
          form.addEventListener('submit',async event=>{event.preventDefault();const value=input.value.trim();if(value&&await workspace.updateNote(note.id,value)){noteDraft=null;renderWorkspace();}});
          row.replaceChildren(form);return input;
        }
        const edit=button('수정',()=>editor().focus());edit.disabled=locked;
        row.append(el('p',note.text),el('time','작성 '+time(typeof note.created_at==='number'?new Date(note.created_at).toISOString():note.created_at)),edit,del);
        if(noteDraft?.id===note.id&&draftOwner===noteDraft.owner)editor();append('note-list',row);
      }
      if(!state.notes.length)workspaceEmpty('note-list','저장된 메모가 없습니다. 내 메모는 WIE의 근거가 아닙니다.');
      if($('conversation-opt-in'))$('conversation-opt-in').checked=!!state.preferences.conversation_opt_in;
      if($('conversation-retention'))$('conversation-retention').value=String(state.preferences.retention_days||30);
      if($('workspace-persona'))$('workspace-persona').value=state.preferences.preferences?.persona||state.principal?.persona||'research';
      for(const conversation of state.conversations){const row=el('section',undefined,'workspace-entry'),value=conversation.payload||{};
        const del=button('삭제',()=>workspace.removeConversation(conversation.id));del.disabled=locked;
        row.append(el('h4',value.question||'저장된 대화'),el('p',value.answer?.answer||'현재 표시할 수 없는 저장 답변'),
          el('p','직접 저장한 대화 · WIE 근거 아님 · 보존 기한 '+time(conversation.expires_at),'muted'),del);append('conversation-list',row);}
      if(!state.conversations.length)workspaceEmpty('conversation-list','직접 저장한 대화가 없습니다. 저장 동의만으로 대화를 자동 수집하지 않습니다.');
    }
    function showAdaptiveLens({family,epoch,projection,authority}){
      adaptiveLensActive=true;clear('lens-content');chatId++;const parent=$('lens-content');if(!parent)return;
      parent.append(el('h2',(FAMILY_LABELS[family.family]||family.family)+' · 학습 근거','lens-title'),
        el('p','보존된 완료 영수증과 모델·상태의 연결입니다. 이 화면에서 모델을 다시 실행하지 않습니다.','muted'));
      fieldList(parent,[['학습 방법',METHOD_LABELS[family.method]||family.method],['실험 기준 시각',time(epoch.start_at)],
        ['완료 결과 SHA-256',authority?.result_sha256],['저널 끝 해시',projection.bounds?.journal_seal?.tip]]);
      for(const model of arr(projection.models).filter(m=>m.family===family.family)){
        const section=el('section',undefined,'lens-section');section.append(el('h3','모델과 학습 자료'));
        fieldList(section,[['모델 ID',model.model_id],['모델 파일 SHA-256',model.artifact_hash],['학습 예시',str(model.training?.examples)],
          ['학습 자료 기준',time(model.training?.cutoff)],['스냅샷 ID',model.training?.snapshot_id],['생성 시각',time(model.created_at)]]);parent.append(section);
      }
      for(const state of arr(projection.states))fieldList(parent,[['상태 ID',state.state_id],['상태 자료 시각',time(state.as_of)],['물리적 발생률','관측 과정과 분리해 식별하지 못함']]);
      parent.append(link('Quant에서 학습 비교 보기','/quant/#adaptive-audit'));parent.setAttribute('tabindex','-1');parent.focus();
    }
    function renderFounder(){if(!founder||!view)return;
      clearTimer(adaptiveTimer);const expiry=renderAdaptive(d,$('adaptive-content'),view.payload.adaptive,{now,onInspect:showAdaptiveLens});
      if(expiry)adaptiveTimer=setTimer(()=>{renderAdaptive(d,$('adaptive-content'),null,{now});if(adaptiveLensActive)clear('lens-content');},Math.min(expiry-now(),2147483647));
      for(const id of ['founder-hypotheses','question-list','review-history','source-categories','source-health'])clear(id);for(const h of arr(view.model.hypotheses)){const p=h.proposal||{};const row=el('section',undefined,'hypothesis-entry');row.append(button((p.cause||h.hypothesis_id)+' → '+(p.effect||'결과 미정'),()=>focus(h.id)),el('p',p.mechanism||'전달 과정 미기록'),el('p','지지 관측 '+arr(p.supporting).length+'건 · 반대 관측 '+arr(p.opposing).length+'건 · '+(h.status||'미확인')));append('founder-hypotheses',row);}if(!arr(view.model.hypotheses).length)append('founder-hypotheses',empty('등록된 경쟁 가설이 없습니다. 열린 관측을 살펴보고 다음 조사 조건을 확인하세요.'));
      for(const q of arr(view.model.next_questions))append('question-list',el('p',text(q),'question-row'));if(!arr(view.model.next_questions).length)append('question-list',empty('현재 모델에 등록된 다음 조사 질문이 없습니다.'));
      const reviews=arr(view.model.reviews);for(const review of reviews){const p=arr(view.model.predictions).find(p=>p.prediction_id===review.prediction_id);const revision=arr(view.model.revisions).find(r=>r.review_id===review.id);const row=el('article',undefined,'history-row');row.append(el('strong',review.hypothesis_id||'모델 결과 비교'));const cols=el('div',undefined,'history-columns');for(const [title,body] of [['이전 예측',p?predictionText(p)+' · 발행 '+time(p.issued_at):'연결된 발행 기록 미확인'],['실제 관측',resultText(review)],['수정한 모델',revision?(revision.reason||revision.status)+' · '+time(revision.recorded_at):'연결된 수정 기록 없음']]){const col=el('div');col.append(el('h3',title),el('p',body));cols.append(col);}row.append(cols);append('review-history',row);}if(!reviews.length)append('review-history',empty('아직 예측과 외부 결과를 비교한 이력이 없습니다. 관측이나 가설 수를 검증 성과로 세지 않습니다.'));
      const health=arr(view.payload.source_health);function showHealth(category){clear('source-health');const filtered=category?health.filter(s=>s.source_category===category):health;for(const s of filtered){const row=el('div',undefined,'source-health-row');row.append(el('strong',s.source_id+' · '+(s.transport_status||'미확인')),el('p','최근 시도 '+time(s.last_attempt_at)+' · 최근 성공 '+time(s.last_success_at)),el('p','해석한 기록 '+(Number.isFinite(s.parsed_count)?s.parsed_count+'건':'미확인')+' · 관측 주기 '+(Number.isFinite(s.cadence_seconds)?s.cadence_seconds+'초':'미확인')+(s.error_code?' · '+s.error_code:'')));append('source-health',row);}if(!filtered.length)append('source-health',empty('이 분류에 보고된 출처 상태가 없습니다. 관측 완료로 해석하지 않습니다.'));}
      const catButtons=[];for(let i=0;i<CATEGORIES.length;i++){const cat=CATEGORIES[i];const b=button(CATEGORY_LABELS[i],()=>{for(const other of catButtons)other.setAttribute('aria-pressed',String(other===b));showHealth(cat);});b.setAttribute('aria-pressed','false');catButtons.push(b);append('source-categories',b);}showHealth(null);
    }
    function renderScope(){clear('world-scope');if(!view?.payload.model)return;const p=view.model.presentation||{},count=value=>Number.isSafeInteger(value)&&value>=0?value+'건':'미확인';const values=[Number.isSafeInteger(p.observations_total)?(founder?'모델 보관 관측 ':'공개 응답 대상 관측 ')+count(p.observations_total):'전체 관측 수 미확인','화면에 받은 관측 '+count(arr(view.model.observations).length),'표시에서 생략 '+count(p.observations_omitted)];if(Number.isSafeInteger(p.hypothesis_groups_omitted))values.push('생략된 가설 묶음 '+count(p.hypothesis_groups_omitted));if(view.model.extraction?.bounded)values.push('관계 추출 범위도 제한됨');values.push('카드와 검색 결과는 현재 표시 범위 기준이며, 관측·기록·지도 점은 다른 단위입니다.');append('world-scope',el('p',values.join(' · '),'muted'));}
    function render(includeWorkspace=true){renderScope();renderCards();renderMap();renderRecords();if(includeWorkspace)renderWorkspace();searchBox?.update();atlas?.render();}
    function clearEvidence(preserveWorkspace=false,reason='unavailable'){evidenceState=reason;evidenceDeadline=null;searchBox?.reset();clear('decision-content');view=null;selected=null;chatId++;clearTimer(adaptiveTimer);adaptiveLensActive=false;for(const id of ['adaptive-content','world-scope','change-cards','world-map','map-relations','record-list','lens-content','founder-hypotheses','question-list','review-history','source-health','source-categories'])clear(id);if($('record-count'))$('record-count').textContent='';if($('more-records'))$('more-records').hidden=true;if($('founder-private'))$('founder-private').hidden=true;if(isAtlas&&!destroyed)renderRecords();if(!preserveWorkspace)renderWorkspace();atlas?.render();}
    function scheduleEvidence(deadline,payload){
      clearTimer(expiryTimer);clearTimer(reloadTimer);reloadTimer=null;evidenceDeadline=deadline;
      if(!deadline)return;
      // This guard remains live during a pre-expiry request. Starting a fetch
      // never extends the authority of the currently rendered evidence.
      expiryTimer=setTimer(()=>{if(evidenceDeadline!==deadline)return;clearEvidence(isAtlas,'expired');
        status('표시 유효 기한이 지나 내용을 닫았습니다. 새로고침으로 다시 확인하세요.','warning');
      },Math.min(Math.max(1,deadline-now()),2147483647));
      if(isAtlas&&!destroyed&&d.visibilityState!=='hidden'&&['OK','MODEL_UNAVAILABLE'].includes(payload.status)){
        const delay=deadline-now()-2000;
        // Very short leases cannot create a tight retry loop. Their expiry
        // guard still closes the content, with an explicit manual retry.
        if(delay>=5000)reloadTimer=setTimer(()=>{reloadTimer=null;void load({automatic:true});},Math.min(delay,2147483647));
      }
    }
    async function load(options={}){
      const automatic=isAtlas&&options?.automatic===true;
      if(destroyed||(isAtlas&&evidenceBusy)||(automatic&&d.visibilityState==='hidden'))return false;
      if(isAtlas)evidenceBusy=true;
      clearTimer(reloadTimer);reloadTimer=null;
      if(catalogueFailed){catalogue=null;catalogueFailed=false;}
      const workspaceReady=founder||automatic?null:workspace.refresh();
      if(atlas&&catalogue===null&&!cataloguePending)cataloguePending=atlas.refreshCatalogue().finally(()=>{cataloguePending=null;});
      const ticket=++loadId;
      if(!automatic){clearTimer(expiryTimer);clearEvidence(false,'loading');status(founder?'Founder 연결을 확인하는 중입니다.':'공개 기록을 불러오는 중입니다.');if($('world-asof'))$('world-asof').textContent='';}
      if($('refresh-world'))$('refresh-world').disabled=true;if($('founder-gate'))$('founder-gate').hidden=true;
      let timeout=null,controller=null;
      if(isAtlas){controller=new AbortController();requestController=controller;timeout=setTimer(()=>controller.abort(),10000);}
      try{
        const response=await fetchImpl(founder?'/api/founder/model':staticOnly?'/wie/explorer.json':'/api/world/explorer',{
          credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'},...(controller?{signal:controller.signal}:{})});
        if(ticket!==loadId||destroyed)return false;
        if(founder&&response.status===401){status('Founder 세션이 연결되지 않았습니다.','warning');$('founder-gate').hidden=false;return false;}
        if(!response.ok)throw new Error('HTTP_ERROR');const payload=await response.json();
        if(ticket!==loadId||destroyed)return false;
        if(isAtlas&&(controller.signal.aborted||d.visibilityState==='hidden'))return false;
        if(staticOnly&&(payload.delivery!=='STATIC_READ_ONLY'||payload.model!==null||payload.valid_until!==null))throw new Error('INVALID_STATIC_RESPONSE');
        if(staticOnly&&(!payload.as_of||!Number.isFinite(Date.parse(payload.as_of))||now()-Date.parse(payload.as_of)>Number(payload.stale_after_seconds||7200)*1000))payload.status='PROJECTION_STALE';
        const next=normalize(payload,founder),deadline=payload.valid_until?Date.parse(payload.valid_until):null;
        if(payload.valid_until&&(!Number.isFinite(deadline)||deadline<=now()))throw new Error('EXPIRED');view=next;
        status(staticOnly?'공개 기록 열람 · STATIC_READ_ONLY · '+(payload.status==='PROJECTION_STALE'?'지난 자료입니다. 현재 상태로 해석하지 마세요.':'자료 기준 시점의 기록입니다.')+' 세계 모델·현재 조건 평가·대화·저장은 서버 미연결.':payload.status==='OK'?'서버가 제공한 기록을 표시합니다.':payload.status==='PROJECTION_STALE'||payload.status==='STALE'?'기준 시각이 오래된 기록입니다. 현재 상태로 해석하지 마세요.':'세계 모델 입력을 확인할 수 없습니다. 제공된 공개 기록 범위만 표시합니다.',payload.status==='OK'?'':'warning');
        if($('world-asof'))$('world-asof').textContent='자료 기준 '+time(payload.as_of)+(payload.valid_until?' · 표시 유효 기한 '+time(payload.valid_until):'')+(view.model.synthetic?' · 합성 모델, 실세계 증거 아님':'')+(payload.records_truncated?' · 최근 '+payload.records_limit+'건 표시, 이전 기록은 생략':'');
        if($('founder-private'))$('founder-private').hidden=false;
        const hash=location.hash||'';let requested=null;try{if(hash.startsWith('#focus='))requested=decodeURIComponent(hash.slice(7));}catch{/* malformed bookmark cannot become a record */}
        selected=isAtlas?(view.byId.has(atlas?.route.focus)?atlas.route.focus:null):view.byId.has(requested)?requested:rows().find(r=>r.type!=='source')?.id||rows()[0]?.id||null;
        render(!automatic);renderFounder();if(!isAtlas)renderLens();scheduleEvidence(deadline,payload);return true;
      }catch(error){
        if(ticket!==loadId||destroyed)return false;
        if(isAtlas&&controller.signal.aborted&&d.visibilityState==='hidden')return false;
        clearEvidence(isAtlas,error.message==='EXPIRED'?'expired':'unavailable');clearTimer(reloadTimer);reloadTimer=null;
        status(error.message==='EXPIRED'?'표시 유효 기한이 지난 응답입니다. 새로고침으로 다시 확인하세요.':'기록을 불러오지 못했습니다. 서버 연결을 확인하고 다시 시도하세요.','error');
        append('world-map',empty('자료를 확인할 수 없습니다. 이전 자료로 현재 상태를 대신하지 않습니다.'));if(founder)$('founder-gate').hidden=false;return false;
      }finally{
        clearTimer(timeout);if(requestController===controller)requestController=null;evidenceBusy=false;
        if(ticket===loadId&&$('refresh-world'))$('refresh-world').disabled=false;
        if(revalidateOnReturn&&!destroyed&&d.visibilityState!=='hidden'){revalidateOnReturn=false;void load({automatic:true});}
        await workspaceReady;await cataloguePending;
      }
    }
    const visibilityTarget=d.addEventListener?d:eventTarget;
    function visibilityChanged(){if(!isAtlas||destroyed)return;
      if(d.visibilityState==='hidden'){clearTimer(reloadTimer);reloadTimer=null;revalidateOnReturn=false;requestController?.abort();return;}
      if(!evidenceDeadline||now()>=evidenceDeadline)clearEvidence(true,evidenceDeadline?'expired':evidenceState);
      if(evidenceBusy){revalidateOnReturn=true;return;}void load({automatic:true});
    }
    if(isAtlas)visibilityTarget.addEventListener?.('visibilitychange',visibilityChanged);
    if($('search-candidates')?.dataset.autocomplete==='true')searchBox=searchModule.mount({document:d,input:$('world-search'),host:$('search-candidates'),now,setTimer,clearTimer,
      localItems:()=>searchModule.recordItems(view?.records,{synthetic:view?.model.synthetic,stale:['STALE','PROJECTION_STALE'].includes(view?.payload.status)}),
      loadItems:loadSearchItems,
      onSelect:item=>{if(item.kind==='record'){query='';$('world-search').value=item.name;focus(item.id);renderRecords();}
        else if(atlas){catalogue=mergeCatalogue(catalogue,[item]);atlas.catalogue(catalogue);atlas.openEntity(item);}
        else location.href='/market/?entity='+encodeURIComponent(item.canonical)+'&symbol='+encodeURIComponent(item.id);},
      saved:item=>!!workspace?.state.saved.includes(item.target),
      watchState:()=>({busy:workspace?.busy,readOnly:workspace?.state.principal?.role==='viewer',message:workspace?.state.message}),
      onWatch:founder||staticOnly?null:item=>atlas?atlas.watch(item):workspace.toggleSaved(item.target)});
    $('refresh-world')?.addEventListener('click',load);$('search-form')?.addEventListener('submit',e=>{e.preventDefault();if(searchBox?.suppressSubmit())return;searchBox?.close();query=$('world-search').value.trim();limit=20;atlas?.search(query);render();});$('connected-only')?.addEventListener('change',renderMap);$('more-records')?.addEventListener('click',()=>{limit+=20;renderRecords();});
    if(!founder){
      $('interest-form')?.addEventListener('submit',async e=>{e.preventDefault();const input=$('interest-input'),value=input.value.trim();if(value&&await workspace.addInterest(value))input.value='';});
      $('note-form')?.addEventListener('submit',async e=>{e.preventDefault();const input=$('note-input'),value=input.value.trim();if(atlas&&!atlas.requireAccount('내 생각과 확인할 조건을 메모로 남겨보세요.'))return;if(value&&await workspace.addNote(value))input.value='';});
      $('workspace-refresh')?.addEventListener('click',()=>workspace.refresh());$('workspace-logout')?.addEventListener('click',()=>workspace.logout());
      $('workspace-login')?.addEventListener('click',()=>workspace.login(atlas?.returnTo));
      $('watchlist-select')?.addEventListener('change',()=>workspace.selectList($('watchlist-select').value));
      $('workspace-preferences')?.addEventListener('submit',async e=>{e.preventDefault();if(atlas&&!atlas.requireAccount('내 화면과 대화 저장 범위를 설정하세요.'))return;await workspace.setPreferences({
        conversation_opt_in:$('conversation-opt-in').checked,retention_days:Number($('conversation-retention').value),
        preferences:{...workspace.state.preferences.preferences,persona:$('workspace-persona').value}});});
      $('conversation-delete-all')?.addEventListener('click',()=>workspace.deleteConversations());
      clear('legacy-workspace');for(const topic of legacy.state.interests)append('legacy-workspace',el('p','이전 관심 주제 · '+topic));
      for(const id of legacy.state.saved)append('legacy-workspace',el('p','이전 저장 기록 · '+id));
      for(const note of legacy.state.notes)append('legacy-workspace',el('p',note.text));
      if(!legacy.state.interests.length&&!legacy.state.saved.length&&!legacy.state.notes.length)append('legacy-workspace',empty(legacy.error||'이 브라우저의 이전 저장 자료가 없습니다.'));
    }
    if(isAtlas){atlas=atlasModule.create({document:d,location,history,eventTarget,workspace,loadCatalogue,getView:()=>view,focusRecord:focus,renderEvidence:q=>{query=q;renderCards();renderRecords();renderMap();},now,staticOnly});query=atlas.route.q;}
    renderWorkspace();return {load,focus,get atlas(){return atlas;},get view(){return view;},get workspace(){return workspace;},get search(){return searchBox;},destroy(){destroyed=true;clearTimer(reloadTimer);requestController?.abort();visibilityTarget.removeEventListener?.('visibilitychange',visibilityChanged);questionDraft={id:null,text:''};noteDraft=null;atlas?.destroy();searchBox?.destroy();clearTimer(expiryTimer);workspace?.destroy();loadId++;chatId++;clearEvidence();}};
  }
  function validateResearch(request){return !!(request&&request.schema==='wie.quant-request/1'&&['stat-arb','vol-surface','factor-decomp','insider-cluster'].includes(request.family)&&request.dataset?.schema==='wie.quant-dataset/1'&&Array.isArray(request.dataset.rows)&&request.dataset.metadata&&request.config&&request.as_of!==undefined);}
  function mountResearch(d,fetchImpl,options={}){
    const form=d.getElementById('research-form');if(!form)return;
    if(d.body?.dataset.worldDelivery==='STATIC_READ_ONLY'){for(const id of ['research-run','research-file','research-json','research-template','research-family']){const control=d.getElementById(id);if(control)control.disabled=true;}const status=d.getElementById('research-status');if(status)status.textContent='공개 연구 안내 · 계산 서버 미연결. 연구 실행·대화·저장은 제공하지 않습니다.';return null;}
    const file=d.getElementById('research-file'),input=d.getElementById('research-json'),status=d.getElementById('research-status'),result=d.getElementById('research-result'),button=d.getElementById('research-run');
    const reference=d.getElementById('research-reference'),templateButton=d.getElementById('research-template'),family=d.getElementById('research-family');
    const clock=options.now||Date.now,setTimer=options.setTimer||root.setTimeout?.bind(root),clearTimer=options.clearTimer||root.clearTimeout?.bind(root);
    let fileTicket=0,expiryTimer=null,disposed=false;
    function clearReference(message){if(reference){reference.replaceChildren();reference.textContent=message;}}
    let focusId='';try{focusId=new URLSearchParams((options.location||root.location||{}).search||'').get('focus')||'';}catch{/* invalid location has no reference */}
    const contextReady=(async()=>{
      if(!reference||!focusId||focusId.length>256)return;
      reference.hidden=false;clearReference('선택한 공개 기록을 확인하고 있습니다.');
      try{
        const response=await fetchImpl('/api/world/explorer',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error();const payload=await response.json();const deadline=Date.parse(payload.valid_until);
        if(payload.status!=='OK'||!Number.isFinite(deadline)||deadline<=clock())throw new Error();
        const view=normalize(payload),record=view.byId.get(focusId);if(!record)throw new Error();if(disposed)return;
        reference.replaceChildren();
        function add(tag,content){const node=d.createElement(tag);node.textContent=content;reference.append(node);return node;}
        add('h3','연구 참조 · '+record.title);add('p','기록 ID '+record.id+' · 기록 시각 '+time(recordTime(record,clock()))+' · '+(record.status||'상태 미확인'));
        add('p','이 기록은 연구 질문의 참조입니다. 계산에는 아래 연구군에 맞는 수치 자료가 별도로 필요합니다. 관측 문장을 수치로 바꾸거나 검증 결과로 취급하지 않습니다.');
        const back=add('a','Lens로 돌아가기');back.href='/explore/#focus='+encodeURIComponent(record.id);
        for(const ref of arr(record.source_refs).slice(0,5)){const url=safeURL(ref.url);if(url){const a=add('a',ref.attribution||ref.source_id||'근거 원문');a.href=url;a.rel='noopener noreferrer';a.target='_blank';}}
        expiryTimer=setTimer?.(()=>clearReference('참조 기록의 표시 유효 기한이 지났습니다. Lens에서 현재 공개 상태를 다시 확인하세요.'),Math.min(deadline-clock(),2147483647));
      }catch{if(!disposed)clearReference('선택한 기록의 현재 공개 상태를 확인할 수 없습니다. Lens에서 다시 선택하거나, 아래 안내에 따라 별도 자료로 연구하세요.');}
    })();
    input.addEventListener('input',()=>{fileTicket++;});
    file.addEventListener('change',async()=>{
      const ticket=++fileTicket,f=file.files[0];input.value='';result.textContent='';if(!f)return;
      if(f.size>2*1024*1024){status.textContent='파일은 2 MiB 이하로 선택하세요.';return;}
      try{const data=await f.text();if(ticket===fileTicket&&!disposed){input.value=data;status.textContent='파일을 읽었습니다. 실행을 누르면 이 요청을 현재 서버로 보냅니다.';}}
      catch{if(ticket===fileTicket&&!disposed)status.textContent='파일을 읽지 못했습니다. 다시 선택하세요.';}
    });
    templateButton?.addEventListener('click',async()=>{
      const ticket=++fileTicket;templateButton.disabled=true;status.textContent='선택한 연구군의 합성 서식을 불러오고 있습니다.';
      try{
        const response=await fetchImpl('/wie/assets/quant_templates.json',{cache:'no-store'});if(!response.ok)throw new Error();
        const templates=await response.json(),raw=templates.templates?.[family.value];
        if(templates.schema!=='wie.quant-templates/1'||typeof raw!=='string'||new TextEncoder().encode(raw).length>2*1024*1024)throw new Error();
        const request=JSON.parse(raw);if(!validateResearch(request)||request.dataset.metadata.evidence_kind!=='SYNTHETIC')throw new Error();
        if(ticket===fileTicket&&!disposed){input.value=raw;result.textContent='';status.textContent='합성 서식을 불러왔습니다. 전송하지 않았습니다. 형식을 확인하고 필요한 자료·설정을 편집한 뒤 직접 실행하세요.';}
      }catch{if(ticket===fileTicket&&!disposed)status.textContent='합성 서식을 불러오지 못했습니다. 아래 입력 계약을 확인하거나 준비한 JSON 파일을 선택하세요.';}
      finally{templateButton.disabled=false;}
    });
    form.addEventListener('submit',async e=>{
      e.preventDefault();result.textContent='';let request;const raw=input.value;
      try{if(new TextEncoder().encode(raw).length>2*1024*1024)throw new Error();request=JSON.parse(raw.replace(/^\uFEFF/,''));if(!validateResearch(request))throw new Error();}
      catch{status.textContent='요청 형식이 맞지 않습니다. 아래 입력 계약에서 자료·설정 형식을 확인하세요 (최대 2 MiB).';return;}
      button.disabled=true;status.textContent='입력 자료로 연구 계산을 실행하고 있습니다.';
      try{
        // Preserve number spellings (0.0 versus 0) bound by the Python row hash.
        const response=await fetchImpl('/api/world/research',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:raw});
        const data=await response.json();if(!response.ok||data.schema!=='wie.quant-result/1')throw new Error();if(disposed)return;
        status.textContent='계산 상태 '+data.computation_status+' · 검증 상태 '+data.validation_status+' · 주문 '+data.orders+' · '+(request.dataset.metadata.evidence_kind==='SYNTHETIC'?'합성 자료 결과 · 실세계 증거 아님':'입력자의 관측 자료 선언 · 원천 진위는 별도 확인');result.textContent=JSON.stringify(data,null,2);
      }catch{if(!disposed)status.textContent='연구를 완료하지 못했습니다. 서버 연결·권한과 입력 자료를 확인하고 다시 시도하세요.';}
      finally{button.disabled=false;}
    });
    return {contextReady,destroy(){disposed=true;fileTicket++;clearTimer?.(expiryTimer);clearReference('참조 기록을 닫았습니다.');}};
  }
  function mountAdaptiveQuant(d,fetchImpl,options={}){
    const button=d.getElementById('adaptive-audit-load'),container=d.getElementById('adaptive-audit-content');if(!button||!container)return null;
    const now=options.now||Date.now,setTimer=options.setTimer||setTimeout,clearTimer=options.clearTimer||clearTimeout;let ticket=0,timer=null,disposed=false;
    function clear(message){container.replaceChildren();container.textContent=message;}
    button.addEventListener('click',async()=>{
      const current=++ticket;clearTimer(timer);clear('Founder 세션의 학습 기록을 확인하고 있습니다.');button.disabled=true;
      try{
        const response=await fetchImpl('/api/founder/model',{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
        if(!response.ok)throw new Error();const payload=await response.json();if(disposed||current!==ticket)return;
        if(payload.schema!=='wie.founder-view/1')throw new Error();
        const expiry=renderAdaptive(d,container,payload.adaptive,{now,onInspect:({family,projection,authority})=>{
          const panel=d.createElement('details');panel.open=true;const title=d.createElement('summary');title.textContent='선택한 계층의 모델·예측 연결';panel.append(title);
          const body=d.createElement('pre');body.className='adaptive-evidence';body.textContent=JSON.stringify({family,
            models:arr(projection.models).filter(m=>m.family===family.family),states:projection.states,completed_authority:authority},null,2);panel.append(body);container.append(panel);
        }});
        if(expiry)timer=setTimer(()=>clear('학습 기록의 표시 기한이 지났습니다. 다시 불러와 주세요.'),Math.min(expiry-now(),2147483647));
      }catch{if(!disposed&&current===ticket)clear('이 컴퓨터의 Founder 세션을 먼저 연결해야 학습 기록을 볼 수 있습니다.');}
      finally{if(current===ticket)button.disabled=false;}
    });
    return {destroy(){disposed=true;ticket++;clearTimer(timer);clear('비공개 학습 기록을 닫았습니다.');}};
  }
  const api={normalize,related,graphSlice,guestStore,safeURL,validateResearch,createApp,mountResearch,renderAdaptive,mountAdaptiveQuant};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WIEWorldApp=api;
  if(root.document){const d=root.document;const page=d.body?.dataset.worldPage;if(page==='explorer'||page==='founder'){let storage=null;if(page!=='founder')try{storage=root.localStorage;}catch{/* legacy store reports unavailability */}const app=createApp({document:d,fetchImpl:root.fetch.bind(root),storage,location:root.location,founder:page==='founder'});root.WIEWorld=app;app.load();root.addEventListener('pagehide',()=>app.destroy());root.addEventListener('pageshow',event=>{if(event.persisted)root.location.reload();});}const research=mountResearch(d,root.fetch?.bind(root));if(research)root.addEventListener('pagehide',()=>research.destroy());const audit=mountAdaptiveQuant(d,root.fetch?.bind(root));if(audit)root.addEventListener('pagehide',()=>audit.destroy());}
})(typeof window!=='undefined'?window:globalThis);
