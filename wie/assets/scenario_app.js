(function(root){
  'use strict';
  const arr=x=>Array.isArray(x)?x:[],text=x=>typeof x==='string'?x:'',num=x=>typeof x==='number'&&Number.isFinite(x)?String(x):'미확인';
  const labels={AVAILABLE:'자료 확인 가능',MISSING_DATA:'자료 부족',PENDING_DATA:'자료 도착 대기',STALE_DATA:'자료 갱신 필요',
    UNKNOWN_RIGHTS:'자료 사용 권한 확인 대기',ACCESS_DENIED:'접근할 수 없음',UNSUPPORTED_DATA_BINDING:'지원하지 않는 자료 기준',
    UNKNOWN_EXCHANGE_CLOCK:'거래일 기준 확인 필요',REVISED_DATA:'원자료 수정 검토 필요',PENDING:'조건 대기',SIGNALLED:'진입 조건 확인',
    OPEN:'가상 보유 중',HOLDING:'가상 보유 중',HOLD_UNDER_PRECOMMITTED_RULES:'사전에 정한 조건에 따라 가상 보유 유지',
    EXIT_NEXT_ELIGIBLE_OPEN:'다음 가능한 시가에 가상 청산',NEXT_REGISTERED_CLOSED_AVAILABLE_BAR:'다음 등록 거래일의 확정 자료 확인',
    EXIT_PENDING:'가상 청산 대기',CLOSED:'가상 추적 종료',INVALIDATED:'가설 무효화',EXPIRED:'기간 만료',
    NO_TRADE:'비진입',NO_FILL:'미체결',UNRESOLVED:'체결 순서 불명',UNEVALUATED:'아직 계산하지 않음',
    WAIT:'조건 대기',WAIT_ENTRY:'진입 조건 대기',WAIT_NEXT_ELIGIBLE_OPEN:'다음 가능한 시가 대기',OBSERVE_BASE:'기본 경로 관찰',
    OBSERVE_OPPOSITE:'반대 경로 관찰',NO_ENTRY_WINDOW_CLOSED:'기간 종료 · 새 진입 없음',NO_ENTRY:'거래 회피',
    WAIT_FOR_ELIGIBLE_DATA:'판단 유보 · 자료 확인',REVIEW_DATA_REVISION:'원자료 수정 확인',REVIEW_CLOSED_PAPER:'종료한 가상 결과 검토',
    REVIEW_INTRABAR_AMBIGUITY:'봉 안의 체결 순서 확인',preregistered:'사전 고정 원본',experiment:'내 조건 변경 실험',
    observational:'관찰 기록',historical_replay:'과거 자료 재생',prospective_paper:'발행 이후 가상 추적',
    scenario_read:'조건 평가',paper_replay:'비용 반영 가상 추적',PLAN:'계획',SIGNAL:'신호',ORDER_ASSUMPTION:'가상 주문 가정',
    FILL:'가상 체결',EXIT:'가상 청산',EXPIRY:'만료',THESIS_INVALIDATION:'가설 무효화',BAR_AVAILABLE:'새 확정 자료',
    STATE_CHANGE:'조건 상태 변경',FRESHNESS_CHANGE:'자료 신선도 변경',DATA_REVISION:'원자료 수정'};
  const label=x=>labels[x]||text(x)||'미확인';
  const date=x=>x&&Number.isFinite(Date.parse(x))?new Date(x).toLocaleString('ko-KR',{timeZone:'Asia/Seoul'})+' KST':label(x);
  const percent=x=>typeof x==='number'&&Number.isFinite(x)?(x*100).toFixed(2)+'%':'미확정';
  const predicate=x=>x?'확정 종가 '+(x.op==='gte'?'≥':'≤')+' '+num(x.value)+' USD':'해당 조건 없음';

  function mount({document:d,fetchImpl,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout,onEvidence,location=root.location}={}){
    const host=d.getElementById('private-scenarios');if(!host)return null;
    const el=(tag,value,cls)=>{const n=d.createElement(tag);if(value!==undefined)n.textContent=String(value);if(cls)n.className=cls;return n;};
    const button=(value,fn)=>{const n=el('button',value);n.type='button';n.addEventListener('click',fn);return n;};
    let dashboard=null,selected=null,focusId=null,busy=false,disposed=false,ticket=0,timer=null,controller=null;
    const status=el('p','비공개 시나리오를 불러오면 저장한 원본과 실험을 확인할 수 있습니다.','muted');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const loadButton=button('시나리오 불러오기',()=>load()),header=el('div',undefined,'section-heading');
    const cancelButton=button('요청 대기 취소',()=>{ticket++;controller?.abort();controller=null;controls(false);
      clear('요청 대기를 취소했습니다. 저장 여부는 다시 불러와 확인할 수 있습니다.');});cancelButton.hidden=true;
    header.append(el('h2','예측에서 다음 행동까지'),loadButton,cancelButton);
    const content=el('div',undefined,'scenario-content');host.replaceChildren(header,status,content);
    function clear(message){dashboard=null;selected=null;content.replaceChildren();status.textContent=message;clearTimer(timer);}
    function field(parent,name,value){const row=el('div');row.append(el('dt',name),el('dd',value));parent.append(row);}
    function section(parent,title){const n=el('section',undefined,'scenario-section');n.append(el('h3',title));parent.append(n);return n;}
    function controls(disabled){busy=disabled;loadButton.disabled=disabled;cancelButton.hidden=!disabled;host.setAttribute('aria-busy',String(disabled));}
    function expire(until){clearTimer(timer);const remaining=Date.parse(until)-now();if(!(remaining>0))throw new Error('DISPLAY_EXPIRED');
      timer=setTimer(()=>{ticket++;controls(false);clear('표시 기한이 지났습니다. 다시 불러오면 현재 권한과 자료 상태를 확인합니다.');},Math.min(remaining,60000));}
    async function call(action,payload){
      const response=await fetchImpl('/api/founder/scenarios',{method:'POST',credentials:'same-origin',cache:'no-store',signal:controller?.signal,
        headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify({action,payload})});
      const value=await response.json();
      if(response.status===401)throw new Error('FOUNDER_SESSION_REQUIRED');
      if(response.status===429)throw new Error('SCENARIO_BUSY');
      if(value.status==='NOT_CONFIGURED')throw new Error('NOT_CONFIGURED');
      if(!response.ok||value.schema!=='wie.private-scenario-response/1'||value.status!=='OK')throw new Error(value.reason||'SCENARIO_UNAVAILABLE');
      return value;
    }
    function message(error){return error.message==='FOUNDER_SESSION_REQUIRED'?'이 컴퓨터의 Founder 연결을 먼저 열어 주세요. 연결 후 다시 불러올 수 있습니다.':
      error.message==='NOT_CONFIGURED'?'승인된 원본 시나리오와 가격 자료가 아직 연결되지 않았습니다. 자료 사용 권한과 거래일 기준 확인이 필요합니다.':
      error.message==='SCENARIO_BUSY'?'다른 시나리오 계산이 진행 중입니다. 끝난 뒤 다시 눌러 주세요.':
      '요청을 완료하지 못했습니다. 기존 기록은 유지됩니다. 입력 조건과 자료 권한을 확인한 뒤 다시 불러오세요.';}
    async function load(){if(busy||disposed)return;const current=++ticket;controller=new AbortController();controls(true);status.textContent='저장된 시나리오와 현재 자료 권한을 확인하고 있습니다.';
      try{const value=await call('dashboard',{});if(disposed||current!==ticket)return;
        if(value.result?.schema!=='wie.private-scenario-dashboard/1')throw new Error('INVALID_RESULT');
        dashboard=value.result;expire(value.valid_until);render();status.textContent='권한 확인 '+date(dashboard.checked_as_of)+' · 자동 주문·외부 알림 OFF';
      }catch(error){if(current===ticket&&!disposed)clear(message(error));}finally{if(current===ticket)controls(false);}}
    async function mutate(action,payload){if(busy||disposed)return;const current=++ticket;controller=new AbortController();controls(true);status.textContent='요청을 처리하고 있습니다. 같은 작업을 다시 누르지 않아도 됩니다.';
      const request_id=root.crypto?.randomUUID?.()||String(now())+'-'+Math.random().toString(36).slice(2);
      try{const value=await call(action,{...payload,request_id});if(disposed||current!==ticket)return;
        if(value.result?.spec_id)selected=value.result.spec_id;
        const refreshed=await call('dashboard',{});if(disposed||current!==ticket)return;
        if(refreshed.result?.schema!=='wie.private-scenario-dashboard/1')throw new Error('INVALID_RESULT');
        dashboard=refreshed.result;expire(refreshed.valid_until);render();status.textContent='저장했습니다. 원본과 이전 결과는 보존됩니다. · '+date(dashboard.checked_as_of);
      }catch(error){if(current===ticket&&!disposed)clear(message(error));}finally{if(current===ticket)controls(false);}}
    function evidenceButton(id){return button(id,()=>{if(onEvidence)onEvidence(id);else root.WIEWorld?.focus(id);});}
    function choose(id){selected=id;render();d.getElementById('scenario-detail')?.focus();}
    function render(){
      content.replaceChildren();if(!dashboard)return;
      const rows=arr(dashboard.scenarios),matching=focusId?rows.filter(r=>arr(r.spec?.forecast_ids).includes(focusId)||arr(r.spec?.evidence_ids).includes(focusId)):rows;
      if(focusId){const strip=el('div',undefined,'scenario-focus');strip.append(el('p','연결한 기록: '+focusId),button('전체 시나리오 보기',()=>{focusId=null;render();}));content.append(strip);}
      if(!matching.length){content.append(el('p',focusId?'이 기록에 연결된 지원 시나리오가 없습니다. 근거와 반대 조건을 확인하며 관찰할 수 있습니다.':'저장된 시나리오가 없습니다. 승인된 원본이 연결되면 조건 변경 실험과 가상 추적을 시작할 수 있습니다.','empty'));}
      const list=el('div',undefined,'scenario-list');list.setAttribute('aria-label','원본과 조건 변경 실험');
      for(const row of matching){const spec=row.spec,result=row.results?.scenario_read?.result;
        const b=button((spec?.binding?.instrument_id||'자료 확인 대기')+' · '+label(row.track)+' · v'+row.version+' · '+label(result?.status||row.availability?.scenario_read?.status),()=>choose(row.spec_id));
        b.setAttribute('aria-pressed',String(row.spec_id===selected));list.append(b);}
      content.append(list);
      const row=matching.find(r=>r.spec_id===selected)||matching[0];if(row){selected=row.spec_id;renderDetail(row);}
      renderChanges(rows);renderScorecard();renderRisks();
    }
    function renderDetail(row){
      const detail=el('article',undefined,'scenario-detail');detail.id='scenario-detail';detail.setAttribute('tabindex','-1');content.append(detail);
      const spec=row.spec,read=row.results?.scenario_read,paper=row.results?.paper_replay,result=paper?.result||read?.result;
      detail.append(el('h3',spec?.binding?.instrument_id||'자료 사용 상태 확인'),el('p',label(row.track)+' · '+label(row.mode)+' · 버전 '+row.version,'muted'));
      if(!spec){detail.append(el('p',label(row.availability?.scenario_read?.status)+' · 이전 결과와 실험은 저장되어 있습니다. 현재 권한으로 확인 가능한 자료가 연결되면 다시 열 수 있습니다.','warning'));
        if(row.watch_enabled)detail.append(button('관심 등록 해제',()=>mutate('watch',{spec_id:row.spec_id,enabled:false})));return;}
      detail.append(el('p',result?label(result.current_action):'아직 계산하지 않았습니다. 조건 확인을 눌러 현재 상태를 저장하세요.','scenario-action'));
      if(spec.change_reason)detail.append(el('p','내 변경 이유 · '+spec.change_reason,'muted'));
      const facts=el('dl',undefined,'scenario-facts');field(facts,'다음 확인',result?(result.next_check===null?'예정된 다음 확인 없음':date(result.next_check)):'조건 확인 후 표시');
      field(facts,'자료 권한 확인',date(row.checked_as_of));field(facts,'마지막 계산',date((paper?.result?paper:read)?.evaluated_as_of));
      if(result?.freshness)field(facts,'계산 당시 자료 상태',label(result.freshness.coverage));
      const lastBar=arr(result?.observed_bars).at(-1);if(lastBar)field(facts,'마지막 확인한 확정 봉',date(lastBar.closed_at));
      field(facts,'진입 조건',predicate(spec.entry));field(facts,'가설 무효화',predicate(spec.invalidation));field(facts,'비거래 전환 조건',predicate(spec.no_trade));field(facts,'기간',date(spec.starts_at)+' – '+date(spec.expires_at));detail.append(facts);
      const actions=el('div',undefined,'scenario-actions');
      for(const [title,action]of [['조건 확인','evaluate'],['가상 추적','replay']]){const b=button(title,()=>mutate(action,{spec_id:row.spec_id}));
        b.disabled=row.availability?.[action==='replay'?'paper_replay':'scenario_read']?.status!=='AVAILABLE';actions.append(b);}
      actions.append(button(row.watch_enabled?'관심 등록 해제':'관심 등록',()=>mutate('watch',{spec_id:row.spec_id,enabled:!row.watch_enabled})));detail.append(actions);
      detail.append(el('p','관심 등록은 이 연구실의 변화 목록에 사용합니다. 새 자료를 계산할 때 변화가 기록되며, 자동 감시나 외부 전송은 켜지지 않습니다.','muted'));
      const expanded=el('details');expanded.append(el('summary','시나리오 펼치기'));detail.append(expanded);
      const branches=section(expanded,'기본·반대·비거래 경로');
      for(const [key,title] of [['base','기본'],['opposite','반대'],['no_trade','비거래']])branches.append(el('p',title+' · '+spec.branches[key]));
      const source=section(expanded,'근거와 연결된 예측');for(const id of [...arr(spec.forecast_ids),...arr(spec.evidence_ids)])source.append(evidenceButton(id));
      source.append(el('p','자료 기준 · '+spec.binding.exchange+' / '+spec.binding.currency+' / '+spec.binding.timezone+' / '+spec.binding.adjustment,'muted'));
      source.append(el('p','사건의 예측 확률과 거래 수익 확률은 다릅니다. 이 가상 추적은 예측 적중률을 계산하지 않습니다.','muted'));
      if(spec.paper){const assumptions=section(expanded,'가상 체결 가정'),dl=el('dl',undefined,'scenario-facts');
        field(dl,'가격 위험 관리', '계획상 손절 '+num(spec.paper.stop)+' / 목표 '+num(spec.paper.target)+' USD');
        field(dl,'비용', '수수료 '+num(spec.paper.fee_bps)+' · 스프레드 '+num(spec.paper.spread_bps)+' · 슬리피지 '+num(spec.paper.slippage_bps)+' bps');
        field(dl,'체결 시점','신호 이후 가능한 다음 봉 시가');field(dl,'같은 봉 안의 선후 불명',spec.paper.ambiguity==='unresolved'?'판단 유보':'사전 고정한 보수적 손절 가정');
        field(dl,'유동성','최근 확정 봉 거래량 '+num(spec.paper.min_volume)+' 이상 · 한 단위 정규화');assumptions.append(dl,
          el('p','갭·비용·미체결이 반영됩니다. 계획한 손절 가격은 최대 손실을 보장하지 않습니다. 추가 진입·부분 청산·신규 Short는 이 방식에서 지원하지 않습니다.','muted'));}
      renderExperiment(detail,row);renderResult(detail,result);
      const history=section(detail,'계획에서 결과까지');if(!arr(result?.events).length)history.append(el('p','계산 후 계획·신호·가상 체결·청산 기록을 확인할 수 있습니다.','muted'));
      const events=el('ol',undefined,'scenario-events');for(const event of arr(result?.events)){const li=el('li');li.append(el('strong',label(event.kind)),el('p',date(event.at)+' · '+label(event.cause)));events.append(li);}history.append(events);
      const ids=el('details');ids.append(el('summary','원본·실험 식별 정보'),el('p','시나리오 '+spec.scenario_id+' · '+row.spec_id,'scenario-id'));
      if(spec.lineage)ids.append(button('보존된 부모 버전 열기',()=>choose(spec.lineage.parent_spec_id)));detail.append(ids);
    }
    function renderExperiment(parent,row){
      const spec=row.spec,details=el('details');details.append(el('summary','조건 바꿔보기 · 원본을 보존한 새 실험'));parent.append(details);
      const form=el('form',undefined,'scenario-form'),fields={};
      function input(key,title,value){const holder=el('label',title),n=el('input');n.type='number';n.step='any';n.min='0.000001';n.required=true;n.value=String(value);n.id='scenario-edit-'+key;holder.htmlFor=n.id;holder.append(n);form.append(holder);fields[key]=n;}
      input('entry','진입 종가 (USD)',spec.entry.value);input('invalidation','무효화 종가 (USD)',spec.invalidation.value);
      if(spec.paper){input('stop','계획상 손절 (USD)',spec.paper.stop);input('target','목표 (USD)',spec.paper.target);}
      const reasonLabel=el('label','이 조건으로 바꾸는 이유','scenario-reason'),reason=el('textarea');
      reason.id='scenario-change-reason';reasonLabel.htmlFor=reason.id;reason.required=true;reason.maxLength=500;reason.rows=3;
      reason.placeholder='기존 판단에서 무엇을 확인하려는 실험인가요?';reasonLabel.append(reason);form.append(reasonLabel);
      const note=el('p','변경한 조건은 새 실험으로 저장됩니다. 과거 결과가 좋아져도 공식 성과나 전략으로 승격되지 않습니다.','muted');
      const submit=el('button','새 실험으로 저장');submit.type='submit';const error=el('p','','error');error.setAttribute('role','alert');form.append(note,error,submit);
      form.addEventListener('submit',async event=>{event.preventDefault();if(busy)return;const values=Object.fromEntries(Object.entries(fields).map(([k,v])=>[k,Number(v.value)]));
        if(Object.values(values).some(v=>!Number.isFinite(v)||v<=0)||(spec.paper&&values.stop>=values.target)){error.textContent='가격은 0보다 커야 하고, 손절은 목표보다 낮아야 합니다.';return;}
        if(!reason.value.trim()||reason.value.length>500){error.textContent='변경 이유를 500자 이내로 적어 주세요.';reason.focus();return;}
        const overrides={entry:{...spec.entry,value:values.entry},invalidation:{...spec.invalidation,value:values.invalidation},change_reason:reason.value.trim()};
        if(spec.paper)overrides.paper={...spec.paper,stop:values.stop,target:values.target};
        if(spec.mode==='prospective_paper'&&Date.parse(spec.starts_at)<now()){
          error.textContent='이미 시작된 기간은 새 사전 실험으로 저장할 수 없습니다. 아래 과거 재생 선택을 확인하세요.';return;
        }
        await mutate('copy',{spec_id:row.spec_id,overrides});});
      if(spec.mode==='prospective_paper'&&Date.parse(spec.starts_at)<now()){
        const retrospective=button('이 기간을 과거 재생 실험으로 복사',()=>{const entry=Number(fields.entry.value),invalidation=Number(fields.invalidation.value);
          const stop=fields.stop?Number(fields.stop.value):null,target=fields.target?Number(fields.target.value):null;
          if(![entry,invalidation,...(spec.paper?[stop,target]:[])].every(v=>Number.isFinite(v)&&v>0)||(spec.paper&&stop>=target)){error.textContent='입력 가격과 손절·목표 순서를 확인하세요.';return;}
          if(!reason.value.trim()||reason.value.length>500){error.textContent='변경 이유를 500자 이내로 적어 주세요.';reason.focus();return;}
          const overrides={entry:{...spec.entry,value:entry},invalidation:{...spec.invalidation,value:invalidation},mode:'historical_replay',change_reason:reason.value.trim()};
          if(spec.paper)overrides.paper={...spec.paper,stop,target};return mutate('copy',{spec_id:row.spec_id,overrides});});form.append(retrospective);
        submit.disabled=true;note.textContent+=' 이미 지난 기간은 아래 버튼으로 과거 재생 실험만 만들 수 있습니다.';
      }
      details.append(form);
    }
    function renderResult(parent,result){
      if(!result)return;const box=section(parent,'가상 결과 · 실제 계좌 수익 아님'),dl=el('dl',undefined,'scenario-facts');
      field(dl,'현재 상태',label(result.status));field(dl,'비용 차감 수익률',percent(result.metric?.net_return));
      field(dl,'단일 포지션 최대 낙폭',percent(result.metric?.max_drawdown));field(dl,'같은 구간 기준 수익률',percent(result.metric?.benchmark_return));box.append(dl);
      if(result.historical_outcome)box.append(el('p','이전 종료 결과는 보존되어 있습니다. 현재 근거 검토: '+label(result.outcome_review?.state),'muted'));
      box.append(el('p','미진입·미체결·무효화·만료·자료 누락도 전체 목록에 남습니다. 가상 손익은 별도 예측 평가와 합치지 않습니다.','muted'));
    }
    function renderChanges(rows){const box=section(content,'등록한 관심 시나리오의 변화'),watched=new Set(rows.filter(r=>r.watch_enabled).map(r=>r.spec_id));
      const changes=arr(dashboard.changes?.changes).filter(c=>watched.has(c.spec_id));
      if(!changes.length)box.append(el('p','아직 표시할 변화가 없습니다. 관심 등록 후 조건 확인이나 가상 추적을 실행하면 새 변화가 여기에 남습니다.','muted'));
      const list=el('ol',undefined,'scenario-events');for(const row of changes.slice().reverse()){const c=row.change,li=el('li');li.append(button(label(c.kind)+' · '+date(c.at),()=>choose(row.spec_id)),
        el('p',label(c.prior_state)+' → '+label(c.current_state)+' · '+(Array.isArray(c.cause)?c.cause.map(label).join(', '):label(c.cause))));list.append(li);}box.append(list);
    }
    function renderScorecard(){const box=section(content,'원본과 실험의 성적표');box.append(el('p','내 저장 모집단 전체 '+num(dashboard.scorecard?.population_count)+'개. 원본·실험, 과거 재생·발행 이후 추적, 조건 평가·가상 손익을 각각 구분합니다.','muted'));
      for(const [key,g]of Object.entries(dashboard.scorecard?.groups||{})){const details=el('details');details.append(el('summary',key.split('/').map(label).join(' · ')+' · 전체 '+num(g.total)+' / 확정 '+num(g.resolved)));
        const dl=el('dl',undefined,'scenario-facts');field(dl,'미확정·보류 포함',num(g.unresolved));field(dl,'확정 결과 평균 수익률',percent(g.mean_net_return));field(dl,'단일 포지션 최대 낙폭',percent(g.max_single_position_drawdown));
        for(const [state,count]of Object.entries(g.states||{}))field(dl,label(state),num(count));details.append(dl);box.append(details);}
      const a=el('a','예측·외부 결과·학습 변경 확인');a.href='#learning-history';box.append(a);
    }
    function renderRisks(){const box=section(content,'함께 의존하는 전제');
      if(!arr(dashboard.shared_risks?.shared).length)box.append(el('p','현재 접근 가능한 시나리오 중 기간과 조건이 같은 공통 전제는 확인되지 않았습니다. 측정된 상관관계나 분산 효과를 뜻하지 않습니다.','muted'));
      for(const risk of arr(dashboard.shared_risks?.shared)){box.append(el('p',label(risk.kind)+' · '+risk.node_id+' · '+risk.horizon));
        for(const [id,evidence]of Object.entries(risk.spec_evidence||{}))box.append(button('연결된 시나리오 열기',()=>choose(id)),evidenceButton(evidence));}
      const comparisons=arr(dashboard.shared_risks?.comparisons),reasons={DISJOINT_PREDICTED_CONDITIONS:'같은 측정 대상과 기간에 함께 성립할 수 없는 예측 조건',
        DISJOINT_ANTECEDENT_CONDITIONS:'같은 관측에 서로 양립할 수 없는 선행 조건을 요구함',PREDICTION_SCOPE_NOT_ALIGNED:'측정 대상·출처·단위·기간이 일치하지 않음',
        ANTECEDENTS_NOT_ALIGNED:'선행 조건 또는 관측 시점의 동일성을 확인할 수 없음',SCENARIO_CONTEXT_NOT_ALIGNED:'시나리오 기간이나 예측 구간이 다름',
        SCENARIO_CONDITIONING_NOT_ALIGNED:'시나리오의 전제 묶음이 서로 다름',STRUCTURED_PREDICTION_UNAVAILABLE:'허용된 구조화 예측 근거가 없거나 아직 확인되지 않음'};
      box.append(el('h4','전제 충돌 점검'),el('p','저장된 조건의 양립 가능성을 비교합니다. 실제 사건의 진위나 상관관계·포트폴리오 위험을 판정하지 않습니다.','muted'));
      if(!comparisons.length)box.append(el('p','비교할 공통 전제와 예측 쌍이 아직 없습니다.','muted'));
      for(const risk of comparisons.filter(r=>r.status!=='COMPATIBLE')){const detail=el('details');
        detail.append(el('summary',(risk.status==='CONFLICT'?'조건 충돌':'판단 불가')+' · '+(reasons[risk.reason]||'근거 확인 필요')),
          el('p','공통 전제 '+text(risk.node_id)));
        if(risk.selector)detail.append(el('p',text(risk.selector.entity)+' · '+text(risk.selector.variable)+' · '+text(risk.selector.unit)+' · '+date(risk.window_start)+' ~ '+date(risk.window_end)));
        const symbols={gt:'>',ge:'≥',lt:'<',le:'≤',eq:'=',ne:'≠'};
        for(const [id,predicate]of Object.entries(risk.predicates||{}))detail.append(el('p',id+' · '+(symbols[predicate.operator]||'?')+' '+num(predicate.threshold)));
        for(const condition of arr(risk.antecedents))detail.append(el('p','선행 조건 '+text(condition.variable)+' '+(symbols[condition.operator]||'?')+' '+num(condition.threshold)+' '+text(condition.unit)));
        for(const [id,evidence]of Object.entries(risk.spec_evidence||{}))detail.append(button('비교한 시나리오 열기',()=>choose(id)),evidenceButton(evidence));
        for(const id of arr(risk.forecast_ids))detail.append(evidenceButton(id));box.append(detail);}
      const compatible=comparisons.filter(r=>r.status==='COMPATIBLE').length;
      if(compatible)box.append(el('p','비교 가능한 '+compatible+'쌍에서 두 조건이 함께 성립할 수 있습니다. 다른 미확인 전제까지 일치한다는 뜻은 아닙니다.','muted'));
      if(dashboard.shared_risks?.comparisons_truncated)box.append(el('p','한 번에 비교하는 '+num(dashboard.shared_risks.comparison_limit)+'쌍을 넘어 나머지 조건은 미확인입니다.','muted'));
    }
    return {load,focus(id){focusId=id||null;if(dashboard)render();else load();host.scrollIntoView?.({block:'start'});},
      get state(){return {dashboard,selected,busy};},destroy(){disposed=true;ticket++;controller?.abort();clear('비공개 시나리오를 닫았습니다.');}};
  }
  const api={mount,label,percent};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WIEPrivateScenarios=api;
  if(root.document){const app=mount({document:root.document,fetchImpl:root.fetch.bind(root)});if(app){root.WIEScenarios=app;
    root.addEventListener('pagehide',()=>app.destroy());const focus=new URLSearchParams(root.location.search).get('scenario_focus');if(focus)app.focus(focus);}}
})(typeof window!=='undefined'?window:globalThis);
