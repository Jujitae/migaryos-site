(function(root){
  'use strict';
  const names={SEMANTIC:'문장 관계 이해',REPRESENTATION:'표현과 비용 비교',PROSE:'원문과 학습 모델 연결',RESEARCH:'조사 방법과 교훈 비교',
    PENDING_AUTHORITY:'추가 실행 승인 대기',PENDING_UPSTREAM:'선행 결과 대기',PENDING_EXECUTION:'등록한 실행 대기',PENDING_REVIEW:'결과 검토 대기',
    RECORDED:'검토된 결과 기록',UNAVAILABLE:'현재 자료 권한 또는 증거 연결 확인 필요',NO_GAIN:'개선 확인 안 됨',
    NOT_MEASURED:'미측정',NOT_SUPPORTED:'지원하지 않음',DESCRIPTIVE_CRITERION_MET:'고정 모집단의 기술적 비교 기준 충족',
    POSITIVE_INFINITY:'양의 무한대',NEGATIVE_INFINITY:'음의 무한대',UNRESOLVED:'미확정',FINITE:'유한 값',
    UNDEFINED_BOTH_INFINITE:'양쪽 무한대로 정의되지 않음',UNDEFINED_NO_COMPLETE_PAIRED_MEAN:'완전한 쌍 평균 없음',
    UNDEFINED_MIXED_INFINITY:'서로 반대인 무한대로 정의되지 않음',UNRESOLVED_NO_COMPLETE_POPULATION_MEAN:'전체 모집단 평균 미확정',
    FAILED_INVALID_INPUT:'입력 오류',rows:'입력 수',groups:'원 그룹 수',
    items:'원문 항목 수',examples:'입력 수',pairs:'문장 쌍 수',outputs:'생성된 출력 수',failures:'실패 수',pair_count:'문장 쌍 수',wall_seconds:'경과 시간 (초)',
    user_cpu_seconds:'사용자 CPU 시간 (초)',kernel_cpu_seconds:'시스템 CPU 시간 (초)',peak_job_memory_bytes:'최대 작업 메모리 (bytes)'};
  Object.assign(names,{
    mean_brier:'브라이어 손실 (Brier)',mean_log_loss:'로그 손실',accuracy:'정확도',ece_descriptive:'기술적 보정 오차 (ECE)',coverage:'예측 제공 비율',
    abstained:'보류 수',zero_true_class_probability_rows:'정답 확률 0인 입력 수',confusion:'분류 집계표',complete_vectors:'완성된 확률 벡터 수',
    max_abs_difference:'최대 절대 차이',mean_abs_difference:'평균 절대 차이',tolerance:'허용 오차',argmax_changes:'최대 확률 분류가 바뀐 수',
    mean_probability_l1:'확률 차이 L1 평균',max_probability_l1:'확률 차이 L1 최대',original_label_brier_change_diagnostic:'원래 정답 기준 Brier 변화 진단',
    mean_control_minus_candidate:'대조군 손실 − 후보 손실 평균',approximate_interval_95:'근사 95% 구간',family_adjusted_lower_bound:'비교군 수 보정 하한',
    examples_over_max_tokens:'모델 토큰 한도 초과 입력 수',full_mean_loss:'전체 입력 평균 손실',predicted:'예측 수',quality_gain:'등록한 품질 차이',
    relative_cost_reduction:'상대 비용 감소',model_calls:'모델 호출 수',vector_count:'확률 벡터 수',quality_score:'품질 점수',
    mean_poisson_loss:'포아송 평균 손실',paired_mean_loss_change:'같은 입력 쌍의 평균 손실 변화',mean_poisson_loss_status_count:'포아송 손실 상태별 수',
    paired_mean_loss_change_status_count:'쌍 손실 변화 상태별 수',residual_denominator:'잔차 분모',gap_budget:'미해결 차이 예산',
    beneficial_constraint_transfers:'도움이 된 제약 이전 수',harmful_transfers:'해가 된 이전 수',model_ids:'모델 식별자',
    update_before:'학습 갱신 전',update_after:'학습 갱신 후',policy_outcome_rows:'조사 방법별 결과 수',opportunities:'판단 기회 수',
    fit_wall_seconds:'학습 경과 시간 (초)',fit_cpu_seconds:'학습 CPU 시간 (초)',inference_wall_seconds:'추론 경과 시간 (초)',inference_cpu_seconds:'추론 CPU 시간 (초)',
    context_codepoints:'문맥 문자 수',input_units:'입력 단위 수',cpu_seconds:'CPU 시간 (초)',simulated_exposure_count:'가상 정보 노출 횟수',
    simulated_exposure_cost:'가상 정보 노출 비용',actual_arm_process_cpu_seconds:'해당 방법의 실제 CPU 시간 (초)',actual_arm_wall_seconds:'해당 방법의 실제 경과 시간 (초)',
    actual_wall_seconds:'실제 경과 시간 (초)',actual_process_cpu_seconds:'실제 CPU 시간 (초)',process_cpu_seconds:'프로세스 CPU 시간 (초)',
    evaluation:'평가',training:'학습',comparison:'등록 비교',operation:'해당 실행',worker:'전체 작업',model:'모델',shared_operation_work:'방법들이 공유한 실행',
    prior:'사전확률 기준선',baseline:'기준선',candidate:'후보',hypothesis_only_lexical:'가설 문장만 쓰는 어휘 모델',full_pair_lexical:'문장 쌍 어휘 모델',semantic_encoder:'의미 인코더',
    stratum:'입력 구간',within_max_tokens:'토큰 한도 이내',over_max_tokens:'토큰 한도 초과',vectors:'확률 벡터',original:'원 입력',diagnostic:'진단 입력',
    restoration:'복원 비교',premise_replacement:'전제 교체 진단',contrast:'대조 비교',truncation:'입력 잘림',horizon:'예측 시계',arm:'조사 방법',status:'상태',
    diagnostics:'진단',coverage_transfer:'관측 범위의 교훈 이전',round_robin:'순서대로 조사',newest_first:'최신순 조사',seeded_random:'고정 난수 조사',
    uncertainty_only:'불확실성 우선',no_research:'추가 조사 없음',decision_relevant_information:'판단 관련 정보 우선',
    result_hash_basis:'결과 해시 기준',custody:'증거 연결 확인',current_rights:'현재 사용 권한',worker_pairing:'작업과 결과 연결',evidence:'표시 근거',
    practical_utility:'실용적 효용',statistical_significance:'통계적 유의성',automatic_promotion:'자동 승격',learned_update:'학습 갱신',
    runtime_execution:'이 변환에서 실행 여부',population_independence:'입력들의 독립성',physical_cause:'물리적 원인',
    NOT_ESTABLISHED:'입증되지 않음',NOT_ESTABLISHED_BY_PROJECTION:'이 표시로 입증되지 않음',NOT_IDENTIFIED_BY_PROJECTION:'이 표시로 식별되지 않음',
    NOT_SUPPORTED_BY_SOURCE_RESULT_SCHEMA:'원 결과가 학습 전후 비교를 제공하지 않음',NOT_PERFORMED_BY_PROJECTOR:'결과 변환 과정에서는 실행하지 않음',
    ORIGINAL_SUPPLIED_AGGREGATES_ONLY:'원 결과가 제공한 집계만 사용',CALLER_VERIFIED_NOT_ESTABLISHED_BY_PROJECTOR:'호출자가 확인하며 이 표시는 추가 인증이 아님',
    CALLER_VERIFIED_CURRENT_RIGHTS_REQUIRED:'호출자가 현재 권한을 확인해야 함',CALLER_VERIFIED_REQUEST_RESULT_WORKER_PAIRING_REQUIRED:'호출자가 요청·결과·작업을 연결해야 함',
    CANONICAL_ENVELOPE_OBJECT_NOT_INDEPENDENT_RAW_FILE_HASH:'정규화한 결과 객체 해시 · 별도 원본 파일 인증 아님',
    COMPLETE_REGISTERED_EVALUATION:'등록한 평가 완료',RETROSPECTIVE_REPLAY_NONCONFIRMATORY:'과거 재생 · 확증 평가 아님',
    RULE_OUTPUTS_RETAINED_UNSCORED:'규칙 출력 보관 · 품질 미채점',PUBLIC_CONNECTION_DIAGNOSTIC_NOT_PROSE_SCORE:'공개 원문 연결 진단 · 원문 이해 점수 아님',
    REAL_BENCHMARK_DEVELOPMENT_NONCONFIRMATORY:'실제 벤치마크 개발 평가 · 확증 평가 아님'});
  const label=x=>names[x]||(typeof x==='string'&&x.includes('/')?x.split('/').map(part=>names[part]||part).join(' / '):String(x??'미측정')),arr=x=>Array.isArray(x)?x:[];
  const value=x=>typeof x==='boolean'?(x?'예':'아니요'):typeof x==='number'?(Number.isFinite(x)?String(x):'유한 수치 아님'):x===null||x===undefined?'미측정':
    typeof x==='object'?JSON.stringify(x):label(x);
  const cellValue=m=>m.value!==null&&m.value!==undefined?value(m.value):
    ({POSITIVE_INFINITY:'∞',NEGATIVE_INFINITY:'−∞',NOT_MEASURED:'미측정',NOT_SUPPORTED:'지원 안 함',
      UNRESOLVED:'미확정',UNRESOLVED_NO_COMPLETE_POPULATION_MEAN:'미확정',FAILED_INVALID_INPUT:'입력 오류',
      UNDEFINED_BOTH_INFINITE:'정의되지 않음',UNDEFINED_MIXED_INFINITY:'정의되지 않음',
      UNDEFINED_NO_COMPLETE_PAIRED_MEAN:'정의되지 않음'}[m.status]||'미측정');
  function mount({document:d,fetchImpl,now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
    const host=d.getElementById('private-experiments');if(!host)return null;
    const el=(tag,text,cls)=>{const n=d.createElement(tag);if(text!==undefined)n.textContent=String(text);if(cls)n.className=cls;return n;};
    const button=(title,fn)=>{const n=el('button',title);n.type='button';n.addEventListener('click',fn);return n;};
    let state=null,busy=false,timer=null,ticket=0,disposed=false;const chosen=new Set();
    const heading=el('div',undefined,'section-heading'),load=button('비공개 평가 기록 불러오기',()=>request({action:'list'}));
    heading.append(el('h2','무엇이 나아졌고, 무엇은 아직 모르는가?'),load);
    const status=el('p','승인된 고정 실험의 결과와 아직 실행하지 못한 항목을 함께 확인합니다.','muted');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const content=el('div'),comparison=el('div');host.replaceChildren(heading,status,content,comparison);
    function clear(message){state=null;chosen.clear();content.replaceChildren();comparison.replaceChildren();status.textContent=message;clearTimer(timer);}
    async function request(body){if(busy||disposed)return;busy=true;load.disabled=true;host.setAttribute('aria-busy','true');const current=++ticket;
      try{const response=await fetchImpl('/api/founder/experiments',{method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const data=await response.json();if(disposed||current!==ticket)return;
        if(response.status===401)throw Error('SESSION');
        if(!response.ok||data.schema!=='wie.private-experiment-response/1'||data.status!=='OK')throw Error('UNAVAILABLE');
        const until=Date.parse(data.valid_until);if(!(until>now()))throw Error('EXPIRED');state=data;clearTimer(timer);
        timer=setTimer(()=>{ticket++;busy=false;load.disabled=false;host.setAttribute('aria-busy','false');clear('표시 기한이 지났습니다. 다시 불러오면 현재 자료 권한을 확인합니다.');},Math.min(until-now(),60000));render();
      }catch(error){if(!disposed&&current===ticket)clear(error.message==='SESSION'?'이 컴퓨터의 Founder 연결을 먼저 열어 주세요.':'요청을 완료하지 못했습니다. 현재 권한과 자료 연결을 확인한 뒤 다시 불러오세요.');}
      finally{if(current===ticket){busy=false;load.disabled=false;host.setAttribute('aria-busy','false');}}
    }
    function field(parent,key,v){const row=el('div');row.append(el('dt',label(key)),el('dd',value(v)));parent.append(row);}
    function cells(parent,rows,title){
      parent.append(el('h4',title));if(!arr(rows).length){parent.append(el('p','미측정','muted'));return;}
      const table=el('table',undefined,'adaptive-table'),head=el('tr');for(const h of ['측정 항목','범위','원 결과 값','상태','분모'])head.append(el('th',h));const thead=el('thead');thead.append(head);table.append(thead);
      const tbody=el('tbody');for(const m of rows){const row=el('tr');for(const v of [label(m.key),label(m.scope),cellValue(m),m.status==='RECORDED'?'기록된 값':label(m.status),m.denominator===null?'해당 없음':value(m.denominator)])row.append(el('td',v));tbody.append(row);}table.append(tbody);
      const scroll=el('div',undefined,'adaptive-table-scroll');scroll.setAttribute('tabindex','0');scroll.setAttribute('aria-label',title);scroll.append(table);parent.append(scroll);
    }
    function card(entry){const box=el('article',undefined,'experiment-result');box.append(el('h3',label(entry.kind)+' · '+entry.id),el('p',label(entry.state),'scenario-action'));
      const p=entry.projection;if(!p){box.append(el('p','현재 확인할 계산 결과가 없습니다. 결과 수치·모델 버전·개선 여부를 추정하지 않습니다.','muted'));return box;}
      box.append(el('p',label(p.result_status)),el('p','아래는 원래 고정한 입력과 평가 범위의 기록입니다. 실용적 효용·인과·자동승격을 인증하지 않습니다.','muted'));
      cells(box,p.population,'원 입력 모집단');
      const detail=el('details');detail.append(el('summary','손실·비용·범위와 모델 식별 정보'));box.append(detail);
      cells(detail,p.measurements,'원 실험의 집계 측정값');cells(detail,p.cost,'실행 비용');
      for(const [title,object]of [['모델 식별자',p.model_ids],['해석 범위',p.interpretation_boundaries]]){
        detail.append(el('h4',title));const dl=el('dl',undefined,'scenario-facts');if(object&&typeof object==='object'&&Object.keys(object).length)for(const [k,v]of Object.entries(object))field(dl,k,v);else field(dl,title,'NOT_MEASURED');detail.append(dl);}
      const provenance=el('details');provenance.append(el('summary','고정된 입력·결과·구현 연결'),el('p','요청 '+p.request_id,'scenario-id'),
        el('p','결과 '+p.result_sha256,'scenario-id'),el('p','구현 '+p.source_commit,'scenario-id'),el('p','소스 '+p.source_manifest_sha256,'scenario-id'));detail.append(provenance);return box;}
    function compare(entries,title){comparison.replaceChildren(el('h3',title),el('p','선택한 결과를 나란히 봅니다. 서로 다른 과제·분모·손실을 합산하거나 우승 모델을 정하지 않습니다.','muted'));
      const grid=el('div',undefined,'experiment-comparison');for(const e of entries)grid.append(e?card(e):el('p','저장한 버전의 현재 권한 또는 증거 연결을 확인할 수 없습니다.','warning'));comparison.append(grid);}
    function render(){content.replaceChildren();comparison.replaceChildren();const entries=arr(state.catalog?.entries);
      for(const id of chosen)if(!entries.some(e=>e.id===id&&e.state==='RECORDED'))chosen.delete(id);
      status.textContent=state.catalog?.status==='UNAVAILABLE'?'평가 목록이 아직 연결되지 않았습니다. 승인과 자료 연결 상태를 확인해야 합니다.':
        '등록한 평가 항목 '+entries.length+'개 · 확인 가능한 결과 '+entries.filter(e=>e.state==='RECORDED').length+'개 · 원래 입력 모집단과 실행 횟수는 각 결과의 기록을 따릅니다.';
      for(const entry of entries){const row=el('details');row.append(el('summary',label(entry.kind)+' · '+entry.id+' · '+label(entry.state)),card(entry));
        if(entry.state==='RECORDED'){const holder=el('label'),check=el('input');check.type='checkbox';check.checked=chosen.has(entry.id);
          check.addEventListener('change',()=>{if(check.checked&&chosen.size>=4){check.checked=false;status.textContent='한 번에 최대 4개 결과를 비교할 수 있습니다.';return;}check.checked?chosen.add(entry.id):chosen.delete(entry.id);});holder.append(check,el('span','이 고정 결과를 비교에 포함'));row.append(holder);}content.append(row);}
      const form=el('form',undefined,'scenario-form'),nameLabel=el('label','저장할 비교 이름'),name=el('input');name.type='text';name.maxLength=120;name.required=true;nameLabel.append(name);form.append(nameLabel);
      form.append(button('선택 결과 나란히 보기',()=>{if(chosen.size<2){status.textContent='완료된 결과 2개 이상을 선택해 주세요.';return;}compare(entries.filter(e=>chosen.has(e.id)),'선택한 결과 비교');}));
      const save=el('button','이 비교 저장');save.type='submit';form.append(save);form.addEventListener('submit',event=>{event.preventDefault();if(chosen.size<2||!name.value.trim()){status.textContent='결과 2개 이상과 비교 이름이 필요합니다.';return;}
        return request({action:'save',name:name.value.trim(),selections:entries.filter(e=>chosen.has(e.id)).map(e=>({id:e.id,result_sha256:e.projection.result_sha256}))});});content.append(form);
      const saved=el('section',undefined,'scenario-section');saved.append(el('h3','저장한 비교 · 전체 '+arr(state.comparisons).length+'개'));
      for(const row of arr(state.comparisons)){const line=el('div',undefined,'scenario-actions');line.append(button(row.name,()=>compare(row.selections.map(s=>s.entry),row.name)),button('비교 삭제',()=>request({action:'delete',id:row.id})));saved.append(line);}content.append(saved);
      content.append(el('p','저장한 비교는 선택 목록입니다. 원래 실험의 전체 모집단이나 공식 성과를 대체하지 않습니다. 고정 실험 실행과 비공개 정답 열람은 이 화면에서 제공하지 않습니다.','muted'));}
    return {load:()=>request({action:'list'}),get state(){return state;},destroy(){disposed=true;ticket++;clear('비공개 평가 기록을 닫았습니다.');}};
  }
  const api={mount};if(typeof module!=='undefined'&&module.exports)module.exports=api;root.WIEPrivateExperiments=api;
  if(root.document){const app=mount({document:root.document,fetchImpl:root.fetch.bind(root)});if(app){root.WIEExperiments=app;root.addEventListener('pagehide',()=>app.destroy());root.addEventListener('pageshow',event=>{if(event.persisted)root.location.reload();});}}
})(typeof window!=='undefined'?window:globalThis);
