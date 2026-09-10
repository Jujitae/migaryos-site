(function () {
  'use strict';
  const PRIMARY = 'https://raw.githubusercontent.com/Jujitae/migaryos-site/refs/heads/wie-live-data/wie/live.json';
  const LABELS = {SUCCESS:'실행 확인', SOURCE_GAPS:'일부 운영 자료 확인 실패', NO_CANDIDATE:'검사 완료 · 후보 없음',
    NEVER:'실행 전', RUNNING:'실행 중', FAILED:'실행 실패', TIMED_OUT:'실행 시간 초과', STOPPED:'운영 정지',
    INTERRUPTED:'이전 실행 중단', BLOCKED:'운영 확인 중단',
    COMPLETE:'자동 실행 완료', COMPLETE_WITH_SOURCE_GAPS:'실행 완료 · 일부 자료 확인 실패', WAITING_FOR_FRESH_SOURCE:'새 자료를 기다립니다',
    WAITING_FOR_DIARY_LEARNING:'확정 결과의 일기 반영 대기', WAITING_FOR_NEXT_CYCLE:'다음 실행 대기',
    BLOCK:'확인이 중단됐습니다', UNAVAILABLE:'아직 확인하지 못했습니다',
    occurred:'조건 충족', did_not_occur:'조건 미충족', partial:'일부 충족',
    invalid:'무효', unresolvable:'판단 불가', INSUFFICIENT_DATA:'비교할 결과 부족',
    unverifiable:'판정 근거 부족', PARTIAL:'일부 자료 확인', SOURCE_FAILURE:'자료 확인 실패',
    COVERAGE_GAPS:'일부 자산 자료 없음', DISABLED:'자료 연결 대기', NO_CLOSED_BARS:'확정된 가격 봉 없음',
    ANALYZED:'계산 완료', INSUFFICIENT_PIVOTS:'기준 고저점 부족', DESCRIPTIVE_ONLY:'쌓인 표본의 비교 결과',
    NO_SIMULATED_HIT:'합성 경로에서 목표 도달 없음', RARE_TAIL_UNSTABLE:'도달 경로가 적어 시점 추정 불안정',
    MODEL_ESTIMATE_ONLY:'합성 경로의 조건부 시점 추정', AT_TARGET:'기준 가격이 목표에 도달한 상태',
    OBSERVED_GAIN:'비교 표본에서 개선 관측', NO_OBSERVED_GAIN:'비교 표본에서 개선 미관측',
    FITTED:'학습 반영', VERIFIED:'기록 대조 통과', STALE:'오래된 기록', FRESH:'최근 관측', SOURCE_UNAVAILABLE:'자료 확인 실패'};
  const label = value => LABELS[value] || value || '미확정';
  const num = value => typeof value === 'number' && Number.isFinite(value) ? value.toLocaleString('ko-KR') : '미확인';
  const percent = value => typeof value === 'number' ? (value * 100).toFixed(1) + '%' : '미확인';
  const conditionText = c => ({close:'종가',low:'저가',high:'고가'}[c.field]||c.field)+' '+
    ({gt:'>',lt:'<',gte:'≥',lte:'≤'}[c.operator]||c.operator)+' '+num(c.value);
  const time = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat('ko-KR', {
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false
  }).format(new Date(value)) + ' KST' : '미확인';

  function valid(data) {
    return data?.schema === 'wie.public-live/1' && ['VERIFIED','BLOCK'].includes(data.integrity?.status) &&
      Number.isFinite(Date.parse(data.generated_at)) && Array.isArray(data.diary) &&
      Array.isArray(data.predictions) && Array.isArray(data.topics) && Array.isArray(data.universe?.nodes);
  }
  function freshness(data, now = Date.now(), connection = 'primary') {
    if (!valid(data) || data.integrity.status !== 'VERIFIED') return {state:'UNAVAILABLE',text:'기록을 검증하지 못했습니다. 마지막 성공을 현재 상태로 표시하지 않습니다.'};
    const observed = Date.parse(data.observed_at), generated = Date.parse(data.generated_at);
    if (!Number.isFinite(observed) || observed > now + 300000 || generated > now + 300000) {
      return {state:'UNAVAILABLE',text:'기록 시각과 현재 시각이 맞지 않아 최신 여부를 판단할 수 없습니다.'};
    }
    const stale = now - observed > data.freshness.stale_after_seconds * 1000;
    let text = stale ? '마지막 실행 확인에서 2시간이 지났습니다. 현재 실행 상태를 뜻하지 않습니다.' : '최근 자동 실행 기록입니다. 자료별 관측 시각은 각 기록에서 확인하세요.';
    const publicationDelayed = now - generated > 1200000;
    if (publicationDelayed) text += ' 공개 기록 갱신도 20분 이상 지연됐습니다.';
    if (connection === 'embedded') text = '자동 갱신 경로를 확인 중입니다. 저장된 공개 기록을 먼저 표시합니다. ' + text;
    else if (connection !== 'primary') text = '자동 갱신 경로에 연결하지 못해 저장된 공개 기록을 표시합니다. ' + text;
    if (data.run?.status === 'BLOCK') text = '마지막 자동 실행이 중단됐습니다. ' + text;
    return {state:stale?'STALE':publicationDelayed?'PUBLICATION_DELAYED':connection !== 'primary'?'CONNECTION_ERROR':'FRESH',text};
  }
  function stories(data) {
    const cards = new Map([...data.topics,...(data.canonical_chart||[])].map(p => [p.id,p]));
    const items = [];
    for (const d of data.diary) items.push({id:'diary-'+d.day,star_label:d.day+' 일기',title:d.day+' 일기',
      kind:'검증한 일기의 공개 요약',summary:`이날 관측한 자료 ${num(d.mentions_observed)}건, 판단 후보 ${num(d.candidates)}건, 새 결과 ${num(d.resolved)}건입니다.`,
      times:[{label:'일기 대상 날짜',value:d.day},{label:'일기 생성 시각',value:time(d.generated_at)}],
      sections:[{title:'이번 일기에 남긴 결과',body:`새 예측 ${num(d.new_predictions)}건 · 조건대로 결과까지 확인한 기록 ${num(d.closed_loops)}건 · 자료 오류 ${num(d.source_errors)}건입니다.`},
        {title:'해석의 한계',body:'후보는 사건 확정이 아니며, 자료가 늘었다는 사실만으로 학습이나 예측력 향상을 주장하지 않습니다.'}],
      sources:[{label:'날짜별 기록 펼치기',url:'https://migaryos.com'+d.href}],node_labels:[]});
    for (const raw of data.predictions) {
      const p = cards.get(raw.id) || raw;
      items.push(predictionStory(p, raw));
    }
    for (const c of data.chart?.forecasts || []) items.push(predictionStory(c,c,'chart-'));
    for (const c of data.chart?.analyses || []) items.push({id:'analysis-'+c.symbol+'-'+c.timeframe,
      star_label:c.symbol+' · '+c.timeframe,title:c.symbol+' · '+c.timeframe,kind:'가격 자료에서 계산한 관찰',
      summary:'기준 가격 '+num(c.price)+' · 자료 시각 '+time(c.data_as_of||c.as_of),
      times:[{label:'계산 시각',value:time(c.as_of)}],
      sections:[{title:'관찰한 가격대',body:'지지 '+(c.support||[]).map(z=>num(z.price)).join(', ')+' · 저항 '+(c.resistance||[]).map(z=>num(z.price)).join(', ')},
        {title:'해석의 한계',body:'과거 가격에서 고저점과 채널을 계산한 값입니다. 미래의 적중률이나 인과관계를 입증하지 않습니다.'}],
      sources:[{label:'차트와 조건 상세',url:'https://migaryos.com/record/#chart-'+c.symbol+'-'+c.timeframe},...(c.source?.url?[{label:'자료 출처',url:c.source.url}]:[])],node_labels:[]});
    for (const h of data.chart?.hypotheses || []) items.push({id:'hypothesis-'+h.id,star_label:h.symbol+' 목표 가격 가설',title:h.symbol+' 목표 가격 가설',
      kind:'운영자 가설 · 실제 확률 미산출',summary:conditionText(h.target)+' · '+label(h.timing.status),
      times:[{label:'모형 계산 시각',value:time(h.observed_at)}],
      sections:[{title:'모형 결과를 읽는 법',body:'과거 수익률로 만든 합성 경로의 도달 빈도입니다. 목표에 도달한 경로가 없더라도 실제 하락 가능성이 0이라는 뜻은 아닙니다.'},
        ...(h.counterevidence||[]).map(s=>({title:'가설의 한계',body:s}))],
      sources:[{label:'기간별 합성 경로와 무효화 조건',url:'https://migaryos.com/record/#hypothesis-'+h.id}],node_labels:[]});
    return items;
  }
  function predictionStory(p, raw, prefix='prediction-') {
    return {id:prefix+p.id,star_label:p.title+' · '+p.id,title:p.title,kind:'예측 기록 '+raw.id+' · '+label(raw.outcome),
      summary:p.statement || '기존 원장에 등록된 예측의 공개 요약입니다. 원문은 이 화면에 공개하지 않습니다.',
      times:[{label:'등록 시각',value:time(p.issued_at)},{label:'결과 기한',value:time(p.expires_at)},
        {label:'WIE 자료 확인 시각',value:time(p.source?.observed_at)},
        {label:'자료 관측일',value:p.source?.data_date||'미확인'}],
      sections:[{title:'무엇을 예상하나요?',body:`등록 확률 ${percent(p.probability)} · 현재 결과 ${label(raw.outcome)}`},
        {title:'왜 이 예측을 살피나요?',body:p.rationale},{title:'어떤 방법으로 판단하나요?',body:p.method}],
      sources:p.source?.url?[{label:'근거 출처 열기',url:p.source.url}]:[],node_labels:[raw.id]};
  }
  const api = {valid,freshness,stories,time,label,PRIMARY};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window === 'undefined') return;
  window.WIEPublic = api;
  let current = valid(window.WIE_INITIAL) ? window.WIE_INITIAL : null;
  let connection = 'embedded', busy = false, version = '';
  const el = (tag,text,cls) => {const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
  const byId = id => document.getElementById(id);
  function replace(id,children) {const n=byId(id);if(n)n.replaceChildren(...children);}
  function note(text) {return el('p',text,'note');}
  function detail(id,title) {
    const d=el('details');d.id=id;d.append(el('summary',title));return d;
  }
  function facts(entries) {
    const dl=el('dl',undefined,'detail-facts');
    for(const [key,value] of entries){const row=el('div');row.append(el('dt',key),el('dd',value));dl.append(row);}return dl;
  }
  function sourceLink(p) {
    if(!p?.url)return note('공개 출처 링크가 등록되지 않았습니다.');
    const a=el('a','근거 출처 열기 ↗');a.href=p.url;a.target='_blank';a.rel='noopener noreferrer';return a;
  }
  function sourceInfo(source) {
    if(!source)return note('출처 세부 정보는 아직 공개되지 않았습니다.');
    const div=el('section',undefined,'source-info');
    const provider={yahoo:'Yahoo Finance',kraken:'Kraken'}[source.provider]||source.provider||'미확인';
    const kind={official_public:'해당 제공자의 공개 API',market_data_provider:'시장자료 제공자',legacy_authority:'기존 예측의 지정 출처'}[source.kind]||'미확인';
    const adjustment={provider_quote_ohlc_split_adjusted_no_adjclose_mixing:'제공자의 OHLC 사용 · 별도 수정종가 열과 혼합하지 않음',spot_unadjusted_no_dividends:'현물 시세 그대로 사용',provider_adjustment_unknown:'가격 조정 방식 미확인'}[source.adjustment]||source.adjustment||'미확인';
    div.append(facts([['자료 제공자',provider],['출처 구분',kind],['제공자 종목',source.provider_symbol||'미확인'],['표시 통화',source.currency||'미확인'],['WIE 자료 확인',time(source.observed_at)],['마지막 자료 시각',time(source.data_as_of)],['가격 조정',adjustment]]));
    if(source.identity_note)div.append(note('종목 구분: '+source.identity_note));
    if(source.source_identity){const identity=typeof source.source_identity==='string'?source.source_identity:source.source_identity.sha256;div.append(el('code','출처 구분 식별자 '+identity,'digest'));}
    return div;
  }
  function renderTimes() {
    if(!current)return;
    for(const [id,value] of [['observed',current.observed_at],['generated',current.generated_at]]){
      const n=byId(id);if(n){n.textContent=time(value);if(value)n.dateTime=value;}}
    const state=freshness(current,Date.now(),connection), n=byId('freshness');
    if(n){n.textContent=state.text;n.dataset.state=state.state;}
    window.dispatchEvent(new CustomEvent('wie:freshness',{detail:state}));
  }
  function render() {
    if(!current)return;
    renderTimes();
    const page=byId('content');if(!page?.dataset.livePage)return;
    const signature=current.generated_at+':'+current.observed_at;
    if(version===signature)return;version=signature;
    const open=new Set([...document.querySelectorAll('details[open]')].map(d=>d.id));
    byId('run-summary').textContent=current.run?label(current.run.status):'실행 기록 확인 실패';
    byId('run-explanation').textContent=current.integrity.status==='BLOCK'?'영수증 또는 원장 검증을 통과하지 못했습니다. 실행 근거에서 상태를 확인하세요.':
      current.run.status==='WAITING_FOR_FRESH_SOURCE'?'자동 순환은 실행됐고, 새 정식 예측은 충분히 최신인 자료를 기다립니다.':'실행 기록과 실제 예측 결과는 아래에서 따로 확인하세요.';
    if(current.operation)byId('run-explanation').textContent+=' 독립 운영: '+label(current.operation.status)+'.';
    replace('facts', [['등록된 예측',current.counts.predictions],['결과 기록',current.counts.resolved],['조건대로 결과 확인',current.counts.closed_loops],['검증한 일기',current.counts.diaries]].map(([name,count])=>{const div=el('div');div.append(el('dt',name),el('dd',num(count)+'건'));return div;}));
    const learning=current.learning;
    replace('learning-content',learning?[facts([['학습에 반영한 확정 결과',num(learning.training_count)+'건'],['비교용 보조 예측',num(learning.shadow_forecast_count)+'건'],['미래 결과와 비교한 표본',num(learning.evaluation.paired_count)+'건'],['비교 결과',label(learning.evaluation.status)],['학습 시각',time(learning.as_of)]]),
      note('보조 예측을 저장한 횟수는 정확도 향상이 아닙니다. 결과가 확정된 뒤에만 사전에 낸 예측과 비교합니다.')]:[note('학습 기록을 검증하지 못했습니다.')]);
    replace('diary-list',current.diary.length?[...current.diary].reverse().map(d=>{const n=detail('diary-'+d.day,d.day+' 일기 · 새 결과 '+num(d.resolved)+'건');n.append(facts([['일기 생성',time(d.generated_at)],['이날 관측한 자료',num(d.mentions_observed)+'건'],['판단 후보',num(d.candidates)+'건'],['새 예측',num(d.new_predictions)+'건'],['결과 기록',num(d.resolved)+'건'],['조건대로 결과 확인',num(d.closed_loops)+'건'],['자료 오류',num(d.source_errors)+'건']]),
      note('수집 자료와 판단 후보는 확정된 사건이 아닙니다. 새 확정 결과가 0건이면 그날의 결과 학습도 주장하지 않습니다.'),el('code','일기 증거 SHA-256 '+d.sha256,'digest'));return n;}):[note('공개할 수 있는 검증된 일기가 없습니다.')]);
    renderPredictions();renderCharts();renderMarket();
    const machine=[facts([['영수증·원장 대조',label(current.integrity.status)],['최근 실행 상태',label(current.run?.status)],['실행 시작',time(current.run?.started_at)],['실행 종료',time(current.run?.finished_at)]])];
    if(current.operation){
      const operation=current.operation;
      machine.push(facts([['WIE 독립 운영',label(operation.status)],['운영 상태 확인',time(operation.updated_at)]]));
      machine.push(note('수집기 실행 확인은 최근 체크포인트 활동을 뜻하며, 원천 자료의 최신성은 별도입니다.'));
      if(operation.stale)machine.push(note('독립 운영 기록이 30분 이상 갱신되지 않았습니다.'));
      const names={collector:'수집기 점검',anchor:'원본 근거 보존',gate:'Surprise Gate',autonomy:'일기·학습·예측'};
      for(const [name,job] of Object.entries(operation.jobs||{})){
        if(!names[name])continue;
        machine.push(facts([['운영 작업',names[name]],['실행 상태',label(job.status)],['시작',time(job.started_at)],
          ['종료',time(job.finished_at)],['종료 코드',job.exit_code===null?'미확인':String(job.exit_code)],['다음 예정',time(job.next_due_at)]]));
      }
    }
    if(current.run?.error_code)machine.push(note('실행 중단: '+current.run.error_code+' · 내부 오류 원문은 공개하지 않습니다.'));
    for(const code of current.integrity.reasons || [])machine.push(note('확인 실패: '+code));
    if(current.run?.receipt_sha256)machine.push(el('code','실행 영수증 SHA-256 '+current.run.receipt_sha256,'digest'));
    if(current.integrity.ledger_sha256)machine.push(el('code','예측 원장 SHA-256 '+current.integrity.ledger_sha256,'digest'));
    replace('machine-content',machine);
    byId('snapshot-link').href=PRIMARY;
    for(const id of open){const n=byId(id);if(n?.tagName==='DETAILS')n.open=true;}
    openHash();
  }
  function renderPredictions() {
    const cards=new Map([...current.topics,...(current.canonical_chart||[])].map(p=>[p.id,p]));
    const filter=byId('prediction-filter')?.value||'all';
    const predictions=current.predictions.filter(p=>filter==='all'||(filter==='pending'?!p.outcome:!!p.outcome));
    const nodes=predictions.length?[...predictions].reverse().map(raw=>{
      const p=cards.get(raw.id)||raw, n=detail('prediction-'+p.id,p.title+' · '+p.id+' · '+label(raw.outcome));
      if(p.statement)n.append(el('p',p.statement));
      n.append(facts([['등록 확률',percent(p.probability)],['등록 시각',time(p.issued_at)],['결과 기한',time(p.expires_at)],['결과',label(raw.outcome)],['결과 기록 시각',time(raw.resolved_at)],['WIE 자료 확인',time(p.source?.observed_at)],['자료 관측일',p.source?.data_date||'미확인'],['자료 발표일',p.source?.publication_date||'미확인']]),el('h3','이 예측을 살피는 이유'),el('p',p.rationale),el('h3','판단 방법'),el('p',p.method),sourceLink(p.source));
      if(p.probability_mode==='CANONICAL_ADVISORY')n.append(facts([['학습 전 비교 확률',percent(p.raw_probability)],['해당 종류의 학습 결과',num(p.family_training_count)+'건'],['판정 자료 대기 마감',time(p.resolution_deadline)]]),note('등록 확률은 정식 원장에 봉인된 값입니다. 아래 차트의 모의 확률과 구분합니다.'),sourceInfo(p.source));
      if(p.source?.sha256)n.append(el('code','출처 보관본 SHA-256 '+p.source.sha256,'digest'));
      return n;
    }):[note('이 조건에 해당하는 검증된 예측이 없습니다.')];
    if(current.sections?.topics==='BLOCK'||current.sections?.canonical_chart==='BLOCK')nodes.unshift(note('새 예측의 상세 근거 검증이 중단돼 기존 원장의 요약을 표시합니다.'));
    replace('prediction-list',nodes);
  }
  function plot(history,symbol) {
    if(history.length<2)return note('이 출처는 가격 이력의 공개가 설정되지 않았거나 충분한 자료가 없습니다.');
    const values=history.map(x=>x.close).filter(Number.isFinite);if(values.length!==history.length)return note('차트 자료를 표시할 수 없습니다.');
    const lo=Math.min(...history.map(x=>x.low??x.close)),hi=Math.max(...history.map(x=>x.high??x.close)),span=hi-lo||1,ns='http://www.w3.org/2000/svg';
    const svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 720 260');svg.setAttribute('role','img');svg.setAttribute('aria-label',symbol+' 가격 이력');svg.classList.add('price-chart');
    const y=v=>215-(v-lo)/span*180,x=i=>70+i/(values.length-1)*620;
    for(let i=0;i<4;i++){const value=lo+span*i/3,text=document.createElementNS(ns,'text');text.textContent=num(Math.round(value*100)/100);text.setAttribute('x','4');text.setAttribute('y',String(y(value)+4));text.setAttribute('fill','#b0becb');text.setAttribute('font-size','11');svg.append(text);}
    const candleWidth=Math.max(1,Math.min(8,540/history.length));
    history.forEach((c,i)=>{const up=c.close>=(c.open??c.close),color=up?'#b8efcf':'#e9a0a0';
      const wick=document.createElementNS(ns,'line');wick.setAttribute('x1',x(i));wick.setAttribute('x2',x(i));wick.setAttribute('y1',y(c.high??c.close));wick.setAttribute('y2',y(c.low??c.close));wick.setAttribute('stroke',color);svg.append(wick);
      const body=document.createElementNS(ns,'rect');body.setAttribute('x',x(i)-candleWidth/2);body.setAttribute('y',Math.min(y(c.open??c.close),y(c.close)));body.setAttribute('width',candleWidth);body.setAttribute('height',Math.max(1,Math.abs(y(c.open??c.close)-y(c.close))));body.setAttribute('fill',color);svg.append(body);});
    for(const [i,anchor] of [[0,'start'],[history.length-1,'end']]){const text=document.createElementNS(ns,'text');text.textContent=history[i].time.slice(0,10);text.setAttribute('x',x(i));text.setAttribute('y','245');text.setAttribute('text-anchor',anchor);text.setAttribute('fill','#b0becb');text.setAttribute('font-size','12');svg.append(text);}return svg;
  }
  function renderCharts() {
    const chart=current.chart, children=[];
    children.push(note('차트 상태: '+label(chart.status)+(chart.observed_at?' · 관측 '+time(chart.observed_at):'')));
    if(chart.asset_statuses?.length)children.push(facts(chart.asset_statuses.map(s=>[s.symbol,label(s.status)])));
    for(const h of chart.hypotheses||[]){
      const d=detail('hypothesis-'+h.id,h.symbol+' · '+conditionText(h.target)+' 가설');
      const t=h.timing;
      d.append(el('p','운영자가 제시한 목표 가격 가설입니다. 실제 도달 확률은 산출하지 않았습니다.'),
        facts([['검토 조건',conditionText(h.target)],['기준 가격',num(t.reference_price)],['목표까지 필요한 변화',percent(t.required_move_fraction)],['모형 결과',label(t.status)],['과거 수익률 표본',num(t.sample_count)+'개'],['합성 경로',num(t.path_count)+'개'],['모형 계산 시각',time(t.as_of)]]));
      if(t.estimated_arrival){const a=t.estimated_arrival;d.append(note('180일 안에 목표에 도달한 합성 경로만 조건으로 삼은 시점입니다. 전체 경로의 도달 시점이 아닙니다.'),facts([['조건부 중간 도달 시점',num(a.median_calendar_days)+'일'],['조건부 10–90% 구간',num(a.p10_calendar_days)+'–'+num(a.p90_calendar_days)+'일']]));}
      else d.append(note('신뢰할 수 있는 도달 시점을 제시할 만큼 도달 경로가 확보되지 않았습니다. 합성 경로에서 도달이 없더라도 실제 가능성이 0이라는 뜻은 아닙니다.'));
      const table=el('table',undefined,'data-table'),head=el('thead'),headrow=el('tr');for(const s of ['모형 범위','목표 도달 경로','합성 경로 내 도달 비율','미도달 비율'])headrow.append(el('th',s));head.append(headrow);table.append(head);const body=el('tbody');
      for(const row of t.horizons){const tr=el('tr');tr.append(el('th',num(row.calendar_days)+'일'),el('td',num(row.hit_count)+' / '+num(t.path_count)),el('td',percent(row.hit_fraction)),el('td',percent(row.no_hit_fraction)));body.append(tr);}table.append(body);d.append(table);
      for(const c of h.counterevidence||[])d.append(note(c));
      for(const c of h.invalidation_points||[])d.append(note('가설을 다시 살필 조건: '+conditionText(c)));
      for(const limit of t.limitations||[])d.append(note(limit));d.append(sourceLink(h.source));children.push(d);
    }
    for(const row of chart.analyses || []){
      const d=detail('chart-'+row.symbol+'-'+row.timeframe,row.symbol+' · '+row.timeframe+' · '+num(row.price));
      const zones=items=>items.map(z=>num(z.price??z)+(z.confluence_count?' ('+z.confluence_count+'개 근거)':'')).join(', ')||'없음';
      d.append(facts([['자료 확인',time(row.as_of)],['마지막 가격 시각',time(row.data_as_of||row.as_of)],['가격 축',row.scale==='log'?'로그 축':row.scale==='linear'?'선형 축':row.scale||'미확인'],['계산된 지지 가격',zones(row.support||[])],['계산된 저항 가격',zones(row.resistance||[])]]),plot(row.history||[],row.symbol));
      if(row.fibonacci?.levels)d.append(el('h3','고정된 기준점의 되돌림 가격'),facts(Object.entries(row.fibonacci.levels).map(([ratio,value])=>[ratio,num(value)])));
      for(const c of row.channels||[])d.append(el('h3',num(c.lookback)+'개 봉의 평행 채널'),facts([['하단',num(c.lower)],['중심',num(c.mid)],['상단',num(c.upper)],['7일 뒤 기하학적 연장',num(c.projected.lower)+'–'+num(c.projected.upper)]]),note('과거 가격 범위에 맞춘 선을 연장한 값입니다. 미래 가격의 신뢰구간이 아닙니다.'));
      if(row.pivots?.length){const p=detail('pivots-'+row.symbol+'-'+row.timeframe,'확인된 고저점 '+row.pivots.length+'개');p.append(facts(row.pivots.map(v=>[(v.kind==='high'?'고점':'저점')+' · '+time(v.time),num(v.price)+' · 확정 '+time(v.confirmed_at)])));d.append(p);}
      for(const scenario of row.scenarios||[])d.append(el('h3',scenario.name),facts([['성립 조건',conditionText(scenario.condition)],['무효화 조건',conditionText(scenario.invalidation)],['관찰할 목표 가격',num(scenario.target)]]));
      if(row.historical_comparison){const c=row.historical_comparison;d.append(el('h3','과거 사건 전 구간과 비교'),facts([['비교 사건 시점',time(c.event_at)],['대조 구간',num(c.control_count)+'개'],['현재와 사건 전 구간의 거리',num(c.event_similarity_distance)],['대조 구간 중 더 가까웠던 비율',percent(c.event_distance_percentile)],['대조 구간 뒤 상승 비율',percent(c.control_forward_positive_fraction)]]),note(c.event_note),note('작은 수익률 패턴 거리는 원인이 같다는 증거가 아닙니다. 이 비교로 예측 확률을 학습하지 않습니다.'));}
      if(row.source)d.append(sourceInfo(row.source),sourceLink(row.source));children.push(d);
    }
    for(const p of chart.forecasts || []){
      const d=detail('prediction-'+p.id,p.title+' · '+label(p.outcome));d.append(el('p',p.statement),facts([['모의 확률',percent(p.probability)],['발행 시각',time(p.issued_at)],['기한',time(p.expires_at)]]),el('p',p.rationale),el('p',p.method),sourceInfo(p.source),sourceLink(p.source));children.push(d);
    }
    if(!chart.analyses?.length&&!chart.forecasts?.length)children.push(note('공개 가능한 검증된 차트 결과가 아직 없습니다.'));
    replace('chart-list',children);
  }
  function renderMarket() {
    const context=current.market_context;
    if(!context?.series?.length){replace('market-context',[note('검증된 경제 지표가 아직 공개되지 않았습니다.')]);return;}
    const children=[note('자료 확인 '+time(context.observed_at)+' · 관측값만 표시')];
    for(const row of context.series){const d=detail('macro-'+row.id,row.label+' · '+num(row.value)+' '+row.units);
      d.append(facts([['지표 관측일',row.data_date||'미확인'],['자료 상태',label(row.status)],['30일 변화',num(row.change_30d)],['전년 대비 변화율',row.change_yoy_percent===null?'미확인':num(row.change_yoy_percent)+'%']]),sourceLink({url:row.source_url}));
      if(row.raw_sha256)d.append(el('code','출처 보관본 SHA-256 '+row.raw_sha256,'digest'));children.push(d);}
    replace('market-context',children);
  }
  function openHash() {
    let id;try{id=decodeURIComponent(location.hash.slice(1));}catch{return;}
    const target=byId(id);if(target?.tagName==='DETAILS')target.open=true;
  }
  async function fetchSnapshot(url) {
    const response=await fetch(url+'?refresh='+Math.floor(Date.now()/60000),{cache: 'no-store',credentials:'omit',signal:AbortSignal.timeout(15000)});
    if(!response.ok)throw new Error('transport');const data=await response.json();if(!valid(data))throw new Error('schema');return data;
  }
  function accept(data,source) {
    if(current&&Date.parse(data.generated_at)<Date.parse(current.generated_at))return false;
    current=data;connection=source;render();window.dispatchEvent(new CustomEvent('wie:live',{detail:data}));return true;
  }
  async function refresh() {
    if(busy)return;busy=true;const button=byId('refresh-live');if(button){button.disabled=true;button.textContent='확인 중…';}
    try {const data=await fetchSnapshot(PRIMARY);if(!accept(data,'primary')){connection='older_cdn';renderTimes();}}
    catch {connection='failed';try{accept(await fetchSnapshot('/wie/live.json'),'fallback');}catch{}renderTimes();}
    finally {busy=false;if(button){button.disabled=false;button.textContent='지금 다시 확인';}}
  }
  function boot() {
    byId('refresh-live')?.addEventListener('click',refresh);
    byId('prediction-filter')?.addEventListener('change',renderPredictions);
    window.addEventListener('hashchange',openHash);
    if(current){render();window.dispatchEvent(new CustomEvent('wie:live',{detail:current}));}
    refresh();setInterval(refresh,60000);setInterval(renderTimes,30000);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
}());
