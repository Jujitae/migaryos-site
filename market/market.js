// Market Intelligence workspace — observation and exploration only.
//
// TradingView appears through its official embed widgets, created only when
// the visitor asks for them; a personal TradingView subscription is not a
// data API and nothing here pretends otherwise. WIE coverage badges and the
// forecast lane come from the same public projection the universe uses, via
// the shared core. New watchlist changes belong to the authenticated workspace.
import {recordsFromSnapshot, presentRecords, visibleAsOf, coverageFor, effectiveStatus, STATUS_LABELS, COVERAGE_LABELS, OUTCOME_LABELS} from '/wie/assets/world_core.js';

export const WATCHLIST_KEY = 'migaryos.watchlist.v1';
export const WIDGETS = Object.freeze({
  'advanced-chart': cfg => ({autosize: true, symbol: cfg.symbol, interval: 'D', timezone: 'Asia/Seoul', theme: 'dark', style: '1',
    locale: cfg.locale || 'kr', allow_symbol_change: false, hide_side_toolbar: false, withdateranges: true, support_host: 'https://www.tradingview.com'}),
  'symbol-info': cfg => ({symbol: cfg.symbol, locale: cfg.locale || 'kr', colorTheme: 'dark', isTransparent: true, width: '100%'}),
  'technical-analysis': cfg => ({symbol: cfg.symbol, interval: '1D', locale: cfg.locale || 'kr', colorTheme: 'dark', isTransparent: true, width: '100%', height: 420, showIntervalTabs: true}),
  'timeline': cfg => ({feedMode: 'symbol', symbol: cfg.symbol, locale: cfg.locale || 'kr', colorTheme: 'dark', isTransparent: true, width: '100%', height: 420, displayMode: 'regular'}),
  'ticker-tape': cfg => ({symbols: cfg.symbols || [], locale: cfg.locale || 'kr', colorTheme: 'dark', isTransparent: true, showSymbolLogo: false, displayMode: 'compact'}),
});
const EMBED_BASE = 'https://s3.tradingview.com/external-embedding/embed-widget-';
const SAFE_QUERY = /^[\p{L}\p{N} :&=^/!.\-]{1,80}$/u;

const norm = s => String(s).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim();

export function resolveInstrument(query, registry) {
  if (typeof query !== 'string' || !SAFE_QUERY.test(query)) return null;
  const q = norm(query);
  const matches = [];
  for (const item of registry.instruments || []) {
    const keys = [item.id, item.entity_id, item.name, item.tradingview, ...(item.wie_symbols || []), ...(item.aliases || [])].filter(Boolean).map(norm);
    if (keys.includes(q)) matches.push(item);
  }
  return matches.length === 1 ? matches[0] : null;
}

// New saved targets use canonical identity. Old symbol targets are readable only
// when they identify one catalogue entry; a ticker alone must never pick a listing.
export function watchTarget(item, saved, registry) {
  const canonical=item.entity_id||item.id;
  if(saved.includes(canonical))return canonical;
  if(saved.includes(item.id)&&(registry.instruments||[]).filter(row=>row.id===item.id).length===1)return item.id;
  return canonical;
}

function snapshotState(snapshot) {
  if (!snapshot || !snapshot.integrity) return 'BLOCK';
  if (snapshot.integrity.status !== 'VERIFIED') return 'BLOCK';
  return (snapshot.freshness || {}).state === 'STALE' ? 'STALE' : 'VERIFIED';
}

const known=value=>typeof value==='string'&&value.trim()?value:'UNKNOWN';
const stamp=value=>typeof value==='string'?Date.parse(value):NaN;

// Endpoint closing-price ratio and running price peak avoid loss of recovery
// when a near-total decline rounds an adjacent return to -1.
export function priceStatistics(history,{asOf,dataAsOf=asOf}={}) {
  if(!Array.isArray(history)||!history.length)return {status:'NO_DATA'};
  if(history.length>240)return {status:'INVALID_SERIES'};
  const cutoff=Math.min(stamp(asOf),stamp(dataAsOf));if(!Number.isFinite(cutoff))return {status:'INVALID_SERIES'};
  const visible=[];let prior=null,excluded=0;
  for(const row of history){
    if(!row||!Number.isFinite(stamp(row.closed_at)))return {status:'CLOSE_TIME_UNKNOWN'};
    const time=stamp(row.time),closeTime=stamp(row.closed_at);
    if(!Number.isFinite(time)||closeTime<=time||typeof row.close!=='number'||!Number.isFinite(row.close)||row.close<=0||
      (prior&&(time<=prior.time||time<prior.closeTime)))return {status:'INVALID_SERIES'};
    prior={time,closeTime};if(closeTime>cutoff){excluded++;continue;}visible.push({...row,closeTime});
  }
  if(visible.length<2)return {status:visible.length?'INSUFFICIENT_SAMPLE':'NO_DATA',observations:visible.length,excluded_future:excluded};
  const priceReturn=visible.at(-1).close/visible[0].close-1;
  if(!Number.isFinite(priceReturn))return {status:'INVALID_SERIES'};
  let peak=visible[0].close,maxDrawdown=0;
  const months=Array.from({length:12},(_,i)=>({month:i+1,returns:[],years:new Set()}));
  for(let i=1;i<visible.length;i++){
    const value=visible[i].close/visible[i-1].close-1;
    if(!Number.isFinite(value))return {status:'INVALID_SERIES'};
    peak=Math.max(peak,visible[i].close);maxDrawdown=Math.max(maxDrawdown,1-visible[i].close/peak);
    const at=new Date(visible[i].closeTime),month=months[at.getUTCMonth()];month.returns.push(value);month.years.add(at.getUTCFullYear());
  }
  if(!Number.isFinite(maxDrawdown))return {status:'INVALID_SERIES'};
  const grouped=months.map(m=>({month:m.month,samples:m.returns.length,years:m.years.size,
    status:m.returns.length>=2&&m.years.size>=2?'COMPUTED':'INSUFFICIENT_SAMPLE',
    mean_return:m.returns.length>=2&&m.years.size>=2?m.returns.reduce((a,b)=>a+b/m.returns.length,0):null}));
  if(grouped.some(m=>m.status==='COMPUTED'&&!Number.isFinite(m.mean_return)))return {status:'INVALID_SERIES'};
  return {status:'COMPUTED',observations:visible.length,excluded_future:excluded,price_return:priceReturn,max_drawdown:maxDrawdown,
    first_close_at:visible[0].closed_at,last_close_at:visible.at(-1).closed_at,
    seasonality:{status:grouped.every(m=>m.status==='COMPUTED')?'COMPUTED':grouped.some(m=>m.status==='COMPUTED')?'PARTIAL':'INSUFFICIENT_SAMPLE',
      calendar:'UTC',minimum_samples_per_month:2,minimum_years_per_month:2,months:grouped,predictive_claim:false}};
}

function analysisDetails(record,snapshot) {
  const source=record.source_refs?.[0]||{},asset=(snapshot?.chart?.asset_statuses||[]).find(row=>row.symbol===record.symbol);
  const metadata=Object.fromEntries(['provider','provider_symbol','exchange','timezone','session','adjustment','currency'].map(key=>[key,known(source[key])]));
  Object.assign(metadata,{source:known(source.url),data_as_of:known(record.observed_at||source.data_as_of),
    observed_at:known(source.observed_at),fresh_until:record.restricted?'UNKNOWN':known(asset?.fresh_until),
    freshness:record.restricted?'UNKNOWN':asset?.fresh_until&&Number.isFinite(stamp(asset.fresh_until))?
      (Date.now()>stamp(asset.fresh_until)?'STALE':known(asset.status)):asset?.status?asset.status+' (관측 당시)':'UNKNOWN'});
  const raw=(snapshot?.chart?.analyses||[]).find(row=>row.symbol===record.symbol&&row.timeframe===record.timeframe&&row.as_of===record.as_of&&
    row.source?.sha256&&row.source.sha256===source.sha256);
  const statistics=record.restricted?{status:'RIGHTS_RESTRICTED'}:raw?
    priceStatistics(raw.history,{asOf:record.as_of,dataAsOf:record.observed_at||source.data_as_of||record.as_of}):{status:'NO_DATA'};
  return {metadata,statistics};
}

export function coverageRows(registry, snapshot, {rights = null, firstCoverage = null} = {}) {
  // Coverage counts every public record; presentation stubs restricted content.
  const records = presentRecords(recordsFromSnapshot(snapshot, {rights}), {paid: false});
  const asOf = snapshot && snapshot.observed_at ? snapshot.observed_at : null;
  const state = snapshotState(snapshot);
  const manifestIds = new Set(firstCoverage?.entries?.flatMap(e => e.records || []) || []);
  return (registry.instruments || []).map(item => {
    const target = {entity_id: item.entity_id, symbols: [item.id, ...(item.wie_symbols || [])]};
    // Without a VERIFIED snapshot there is no coverage judgement at all: the
    // state is "unavailable", never NOT_COVERED (which is a verdict on data).
    const coverage = state === 'VERIFIED' || state === 'STALE' ? coverageFor(target, records, asOf, {manifest: firstCoverage})
      : {status: 'UNAVAILABLE', market_data: 'unknown', evidence: 'unknown', forecast_forms: [], outcome_audit: 'unknown', records: [], rights: null};
    const mine = records.filter(r => coverage.records.includes(r.id));
    const macro = mine.find(r => r.type === 'macro');
    return {id: item.id, entity_id: item.entity_id || null, name: item.name, asset_class: item.asset_class, region: item.region, tradingview: item.tradingview,
      coverage, coverage_label: COVERAGE_LABELS[coverage.status] || (coverage.status === 'UNAVAILABLE' ? '공개 기록 없음' : coverage.status), market_data: coverage.market_data,
      in_first_coverage: coverage.coverage_records?.some(id => manifestIds.has(id)) || false,
      latest_observation: macro && !macro.restricted ? {value: macro.value, units: macro.units, data_date: macro.data_date, source: (macro.source_refs[0] || {}).url || null, attributions:macro.rights?.attributions||[]} : null,
      rights: macro ? macro.rights.status : (mine[0] ? mine[0].rights.status : null),
      restricted: mine.some(r => r.restricted),
      analyses: mine.filter(r => r.type === 'analysis').map(r => ({id: r.id, timeframe: r.timeframe, price: r.price, as_of: r.as_of, summary: r.summary,
        ...analysisDetails(r,snapshot),attributions:r.rights?.attributions||[]})),
      snapshot: state};
  });
}

export function forecastLane(query, registry, snapshot, asOf, {rights = null} = {}) {
  const item = resolveInstrument(query, registry);
  if (!item) return [];
  const records = visibleAsOf(presentRecords(recordsFromSnapshot(snapshot, {rights}), {paid: false}), asOf || snapshot?.observed_at);
  const byId = new Map(records.map(r => [r.id, r]));
  const symbols = new Set([item.id, ...(item.wie_symbols || [])].map(s => s.toUpperCase()));
  const boundary = Date.parse(asOf || (snapshot && snapshot.observed_at) || '');
  return records.filter(r => (r.type === 'prediction' || r.type === 'chart_forecast')
      && (item.entity_id && r.entity_id === item.entity_id || r.symbol && symbols.has(String(r.symbol).toUpperCase()) || (r.source_refs || []).some(s => s.provider_symbol && symbols.has(String(s.provider_symbol).toUpperCase())))
      && Number.isFinite(Date.parse(r.as_of)) && Date.parse(r.as_of) <= boundary)
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .map(r => {
      const link = (r.links || []).find(l => l.relation === 'recorded_outcome');
      const o = link ? byId.get(link.to) : null;
      const visibleOutcome = o && Number.isFinite(Date.parse(o.observed_at)) && Date.parse(o.observed_at) <= boundary ? o : null;
      const status = effectiveStatus(r, asOf || snapshot.observed_at, byId);
      return {id: r.id, title: r.title, statement: r.summary, issued_at: r.created_at, expires_at: r.valid_until,
        outcome: visibleOutcome ? visibleOutcome.outcome : null, outcome_label: visibleOutcome ? (OUTCOME_LABELS[visibleOutcome.outcome] || visibleOutcome.outcome) : null,
        observed_at: visibleOutcome ? visibleOutcome.observed_at : null, status, status_label: STATUS_LABELS[status] || status,
        probability_label: typeof r.probability === 'number' ? (r.probability * 100).toFixed(1) + '% (등록값)' : '미설정',
        restricted: !!r.restricted, rights: (r.rights || {}).status || 'RESTRICTED',
        locator: r.locator, source: (r.source_refs[0] || {}).url || null, attributions:r.rights?.attributions||[]};
    });
}

export function createWatchlist(storage, registry) {
  const known = new Set((registry.instruments || []).map(i => i.id));
  let ids = [];
  try {
    const parsed = JSON.parse(storage.getItem(WATCHLIST_KEY) || '[]');
    if (Array.isArray(parsed)) ids = parsed.filter(x => typeof x === 'string' && known.has(x));
  } catch { ids = []; }
  const save = () => { try { storage.setItem(WATCHLIST_KEY, JSON.stringify(ids)); } catch { /* storage may be unavailable */ } };
  return {
    ids: () => ids.slice(),
    add(id) { if (!known.has(id) || ids.includes(id)) return false; ids.push(id); save(); return true; },
    remove(id) { const i = ids.indexOf(id); if (i < 0) return false; ids.splice(i, 1); save(); return true; },
  };
}

export function createWidgetLoader(document, container, config) {
  const build = WIDGETS[config && config.widget];
  if (!build) throw new Error('unknown TradingView widget: ' + (config && config.widget));
  let loaded = false;
  return {
    load() {
      if (loaded) return false;
      loaded = true;
      const box = document.createElement('div');
      box.setAttribute('class', 'tradingview-widget-container');
      const inner = document.createElement('div');
      inner.setAttribute('class', 'tradingview-widget-container__widget');
      box.appendChild(inner);
      const script = document.createElement('script');
      script.setAttribute('type', 'text/javascript');
      script.setAttribute('src', EMBED_BASE + config.widget + '.js');
      script.async = true;
      script.textContent = JSON.stringify(build(config));
      box.appendChild(script);
      container.appendChild(box);
      return true;
    },
    get loaded() { return loaded; },
  };
}

// ─────────────────────────────── page boot ─────────────────────────────────

const PRIMARY = 'https://raw.githubusercontent.com/Jujitae/migaryos-site/refs/heads/wie-live-data/wie/live.json';

export function boot(window) {
  const document = window.document;
  const staticOnly=document?.body?.dataset.worldDelivery==='STATIC_READ_ONLY';
  const registry = window.MARKET_REGISTRY;
  if (!registry || !document) return;
  const rights = window.WIE_SOURCE_RIGHTS && window.WIE_SOURCE_RIGHTS.schema === 'migaryos.source-rights/1' ? window.WIE_SOURCE_RIGHTS : null;
  const $ = id => document.getElementById(id);
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  let snapshot = null;
  let snapshotError = null;
  let firstCoverage = window.FIRST_COVERAGE && window.FIRST_COVERAGE.schema === 'migaryos.first-coverage-manifest/1' ? window.FIRST_COVERAGE : null;
  let storage = null;
  try { storage = window.localStorage; } catch { storage = null; }
  const legacy = createWatchlist(storage || {getItem: () => null}, registry);
  let searchBox=null;
  const workspace = window.WIEWorkspace.createWorkspace({fetchImpl:window.fetch.bind(window),staticOnly,
    onChange(){if(applyPersona())renderSelected();renderCatalogue();renderWatchlist();searchBox?.update();}});
  const params = new URLSearchParams(window.location.search || '');
  const personas={trader:'Trader · 시장 관측',research:'Research · 근거와 예측',risk:'Risk / Strategy · 거시와 위험'};
  const explicitPersona=Object.hasOwn(personas,params.get('workspace'))?params.get('workspace'):null;
  let activePersona=explicitPersona||'research',defaultScope,personaOrigin=explicitPersona?'URL에서 선택한 화면':'기본 화면';
  const requested = params.get('entity') || params.get('symbol');
  let symbolChosen=!!requested;
  let selected = resolveInstrument(requested || 'SPX', registry);
  let unknownSymbol = requested && !selected ? requested : null;
  if (!selected) selected = registry.instruments[0];
  const status = $('market-status');
  const say = text => { if (status) status.textContent = text; };
  function applyPersona(){
    const state=workspace.state;
    if(state.status==='LOADING')return false;
    const scope=state.principal?JSON.stringify([state.principal.user_id,state.principal.workspace_id]):null;
    if(defaultScope===scope)return false;defaultScope=scope;
    const saved=state.preferences?.preferences?.persona;
    activePersona=explicitPersona||(state.principal&&Object.hasOwn(personas,saved)?saved:'research');
    personaOrigin=explicitPersona?'URL에서 선택한 화면':state.principal&&Object.hasOwn(personas,saved)?'서버에 저장한 기본 화면':'기본 화면';
    if(!symbolChosen&&activePersona==='risk')selected=registry.instruments.find(row=>row.asset_class==='economy')||selected;
    renderPersona();return true;
  }
  function renderPersona(){
    if($('market-persona-status'))$('market-persona-status').textContent=personas[activePersona]+' · '+personaOrigin;
    for(const [name,id] of [['trader','market-observation'],['research','market-evidence'],['risk','market-risk']]){
      if($(id))$(id).hidden=activePersona!==name;
      const nav=$('market-view-'+name);if(nav){nav.setAttribute('aria-current',activePersona===name?'page':'false');
        const target=new URLSearchParams(params);target.set('workspace',name);target.set('symbol',selected.id);if(selected.entity_id)target.set('entity',selected.entity_id);nav.href='/market/?'+target;}
    }
  }
  function freshnessText() {
    if (!snapshot) return '공개 기록 없음 · ' + (snapshotError || '확인 실패');
    const state = snapshotState(snapshot);
    if (state === 'BLOCK') return '공개 기록 검증 실패 (BLOCK) · WIE 배지를 표시하지 않습니다';
    const aged = Date.now() - Date.parse(snapshot.observed_at) > Number((snapshot.freshness || {}).stale_after_seconds || 7200) * 1000;
    return (aged || state === 'STALE' ? '오래된 기록 (stale) · ' : '최근 기록 · ') + '마지막 실행 ' + snapshot.observed_at + ' · 실시간이 아닙니다';
  }

  function renderCatalogue() {
    const rows = coverageRows(registry, snapshot, {rights, firstCoverage});
    const table = $('catalogue');
    if (!table) return;
    const body = el('tbody');
    for (const row of rows) {
      const tr = el('tr');
      const pick = el('button', row.name + ' (' + row.id + ')', 'link-button'); pick.setAttribute('type', 'button');
      pick.addEventListener('click', () => choose(registry.instruments.find(i => row.entity_id?i.entity_id===row.entity_id:i.id===row.id)));
      const td1 = el('td'); td1.append(pick);
      const target=watchTarget(row,workspace.state.saved,registry);
      const wl = el('button', workspace.state.saved.includes(target) ? '관심목록에서 빼기' : '관심목록에 넣기', 'link-button'); wl.setAttribute('type', 'button');
      wl.disabled=staticOnly||workspace.busy||workspace.state.principal?.role==='viewer';
      wl.addEventListener('click', () => workspace.toggleSaved(target));
      const td5 = el('td'); td5.append(wl);
      tr.append(td1, el('td', row.asset_class + ' · ' + row.region), el('td', row.market_data === 'available' ? '있음' : row.market_data === 'unknown' ? '확인 불가' : '없음'),
        el('td', row.coverage_label + ' (' + row.coverage.status + ')' + (row.in_first_coverage ? ' · 첫 커버리지 대상' : '') + (row.restricted ? ' · 권리 제한' : '')), td5);
      body.append(tr);
    }
    table.replaceChildren(el('caption', '카탈로그 · WIE coverage는 대상별 배지이며 전역 주장이 아닙니다. ' + freshnessText()));
    const head = el('thead'); const hr = el('tr');
    for (const h of ['대상', '분류 · 지역', 'WIE 시장 자료', 'WIE 판단 상태', '관심목록']) hr.append(el('th', h));
    head.append(hr); table.append(head, body);
  }

  function renderWatchlist() {
    const box = $('watchlist');
    if (!box) return;
    const ids = workspace.state.saved;
    box.replaceChildren(el('p', workspace.state.message, 'muted'));
    if(!staticOnly&&workspace.state.loginEnabled&&!workspace.state.principal){
      const login=el('button','Google로 로그인','button');login.type='button';login.disabled=workspace.busy;
      login.addEventListener('click',()=>workspace.login());box.append(login);
      const policy=el('p',undefined,'muted'),privacy=el('a','개인정보 처리 안내'),terms=el('a','이용약관');
      privacy.href='/wie/privacy/';terms.href='/wie/terms/';policy.append(privacy,el('span',' · '),terms);box.append(policy);
    }
    if(workspace.state.principal)box.append(el('p',`${ids.length} / ${workspace.state.limits.watchlist_targets??'—'}개 · 목록 ${workspace.state.watchlists.length} / ${workspace.state.limits.watchlists??'—'}개`));
    const rows = coverageRows(registry, snapshot, {rights, firstCoverage}).filter(r => ids.includes(watchTarget(r,ids,registry)));
    for (const row of rows) {
      const p = el('p');
      const b = el('button', row.name + ' · ' + row.coverage_label, 'link-button'); b.setAttribute('type', 'button');
      b.addEventListener('click', () => choose(registry.instruments.find(i => row.entity_id?i.entity_id===row.entity_id:i.id===row.id)));
      p.append(b); box.append(p);
    }
    const earlier=$('legacy-watchlist');
    if(earlier){earlier.replaceChildren();for(const id of legacy.ids())earlier.append(el('p',id));
      if(!legacy.ids().length)earlier.append(el('p','이 브라우저에 남아 있는 이전 관심목록이 없습니다.'));}
  }

  function renderSelected() {
    const rows = coverageRows(registry, snapshot, {rights, firstCoverage});
    const row = rows.find(r => selected.entity_id?r.entity_id===selected.entity_id:r.id===selected.id);
    $('sel-name').textContent = selected.name + ' (' + selected.id + ')';
    renderPersona();renderMetadata(row);renderPriceStatistics(row);renderRisk(rows);
    const evidenceText = {active: '있음', restricted: '있음 · 권리 제한', none: '없음', unknown: '확인 불가'}[row.coverage.evidence] || row.coverage.evidence;
    $('sel-coverage').textContent = row.coverage.status === 'UNAVAILABLE'
      ? 'WIE 판단 상태: 확인 불가 · ' + freshnessText()
      : 'WIE 판단 상태: ' + row.coverage_label + ' (' + row.coverage.status + ')' + (row.in_first_coverage ? ' · 첫 커버리지 대상' : ' · 첫 커버리지 대상 아님')
        + ' · 시장 자료 ' + (row.market_data === 'available' ? '있음' : '없음') + ' · 근거 ' + evidenceText + ' · 결과 감사 ' + row.coverage.outcome_audit + ' · ' + freshnessText();
    const widgets = $('widgets');
    widgets.replaceChildren();
    if (selected.tradingview) {
      widgets.append(el('p', 'TradingView 공식 위젯은 버튼을 눌러야 불러옵니다. 그 전에는 외부 요청이 없습니다. 위젯 자료의 권리는 TradingView와 각 거래소에 있습니다.', 'muted'));
      for (const [widget, label] of [['advanced-chart', '차트 불러오기'], ['symbol-info', '개요·주요 통계 불러오기'], ['technical-analysis', '테크니컬즈 불러오기'], ['timeline', '뉴스 타임라인 불러오기']]) {
        const host = el('div', undefined, 'widget-host');
        const button = el('button', label); button.setAttribute('type', 'button');
        const loader = createWidgetLoader(document, host, {widget, symbol: selected.tradingview, locale: 'kr'});
        button.addEventListener('click', () => { if (loader.load()) { button.disabled = true; button.textContent = label.replace('불러오기', '불러옴'); } });
        widgets.append(button, host);
      }
    } else {
      widgets.append(el('p', '이 대상은 표시용 차트 위젯이 없습니다. 공개 관측값과 WIE 기록으로 대신 봅니다.', 'muted'));
    }
    const lane = $('forecast-lane');
    lane.replaceChildren();
    const entries = snapshot ? forecastLane(selected.entity_id||selected.id, registry, snapshot, null, {rights}) : [];
    if (!entries.length) lane.append(el('p', '이 대상에 발행된 WIE 예측이 없습니다. 미발행은 부정 판단이 아닙니다.', 'muted'));
    for (const e of entries) {
      const d = el('details');
      d.append(el('summary', e.title + ' · ' + e.status_label + ' · ' + e.probability_label));
      d.append(el('p', e.statement));
      const dl = el('dl');
      for (const [k, v] of [['발행 시각', e.issued_at], ['기한', e.expires_at], ['결과', e.outcome_label || '아직 기록 없음'], ['결과 관측 시각', e.observed_at || '—']]) { dl.append(el('dt', k), el('dd', v || '—')); }
      d.append(dl);
      const a = el('a', '우주 화면에서 이 기록 보기'); a.href = e.locator.route + '#focus=' + e.locator.focus; d.append(a);
      const scenario = el('a', '비공개 조건부 시나리오 확인');
      scenario.href = '/founder/?scenario_focus=' + encodeURIComponent(e.locator.focus) + '#private-scenarios'; d.append(scenario);
      if (e.source) { const s = el('a', '근거 출처'); s.href = e.source; s.target = '_blank'; s.rel = 'noopener noreferrer'; d.append(s); }
      for(const credit of e.attributions)d.append(el('small',credit));
      lane.append(d);
    }
    const signals = $('signals');
    signals.replaceChildren();
    if (row.latest_observation) signals.append(el('p', '공개 관측값 ' + row.latest_observation.value + ' ' + (row.latest_observation.units || '') + ' · 관측일 ' + (row.latest_observation.data_date || '미확인')));
    for(const credit of row.latest_observation?.attributions||[])signals.append(el('small',credit));
    if (row.restricted) signals.append(el('p', '원천 자료의 공개 표시 권리가 확인되지 않아 수치를 표시하지 않습니다 (rights-restricted). 기록은 존재하며 부정 판단이 아닙니다.', 'notice'));
    if (!row.analyses.length && !row.latest_observation && !row.restricted) signals.append(el('p', 'MIGARYOS 자체 신호가 없습니다. 신호 부재는 판단이 아닙니다.', 'muted'));
    for (const a of row.analyses) {
      const p = el('p', a.timeframe + ' · ' + a.summary + ' ');
      const link = el('a', '우주 화면에서 보기'); link.href = '/loop.html#focus=' + encodeURIComponent(a.id); p.append(link); signals.append(p);
      for(const credit of a.attributions)signals.append(el('small',credit));
    }
    const universe = $('sel-universe');
    if (universe) universe.href = '/loop.html' + (row.coverage.records.length ? '#focus=' + encodeURIComponent(row.coverage.records[0]) : '');
    try { params.set('symbol',selected.id);if(selected.entity_id)params.set('entity',selected.entity_id);else params.delete('entity');window.history.replaceState(null, '', '?'+params.toString()+(window.location.hash||'')); } catch { /* ignore */ }
    if (unknownSymbol) say('카탈로그에 없는 대상 "' + unknownSymbol.slice(0, 40) + '" 입니다. 종목이 없는 국가·사건·거시 주제는 우주 화면과 거시 관측에서 봅니다. 대신 ' + selected.name + '을(를) 표시합니다.');
    else if (!snapshot || snapshotState(snapshot) === 'BLOCK') say('선택: ' + selected.name + ' · ' + freshnessText());
    else say('선택: ' + selected.name + ' · ' + row.coverage_label + (row.in_first_coverage ? ' · 첫 커버리지 대상' : '') + ' · ' + freshnessText());
  }

  function fields(parent,values){const dl=el('dl',undefined,'market-metadata');for(const [label,value] of values)dl.append(el('dt',label),el('dd',known(value)));parent.append(dl);}
  function renderMetadata(row){
    const box=$('chart-metadata');if(!box)return;box.replaceChildren();
    box.append(el('p','공통 대상 ID · '+known(row.entity_id)));
    const widget=el('details');widget.append(el('summary','TradingView 차트 · 표시 설정과 원자료 기준'));
    fields(widget,[['출처','TradingView 공식 embed 위젯'],['위젯 요청 심볼',selected.tradingview],['데이터 거래소','UNKNOWN'],
      ['차트 표시 시간대','Asia/Seoul · 표시 설정'],['원자료 시간대','UNKNOWN'],['거래 세션','UNKNOWN'],['가격 조정 방식','UNKNOWN'],['자료 시각·지연','UNKNOWN']]);box.append(widget);
    for(const analysis of row.analyses){const detail=el('details');detail.open=true;detail.append(el('summary','WIE 가격 관측 · '+analysis.timeframe));
      const m=analysis.metadata;fields(detail,[['자료 출처',m.source],['제공자',m.provider],['제공자 심볼',m.provider_symbol],['거래소',m.exchange],
        ['원자료 시간대',m.timezone],['거래 세션',m.session],['가격 조정 방식',m.adjustment],['통화',m.currency],['가격 자료 시각',m.data_as_of],
        ['수집 시각',m.observed_at],['자료 신선도',m.freshness],['신선도 유효 기한',m.fresh_until]]);box.append(detail);}
    if(!row.analyses.length)box.append(el('p','WIE 가격 자료 출처·제공자 심볼·거래소·시간대·세션·조정 방식·신선도: UNKNOWN · 제공된 가격 관측이 없습니다.','muted'));
  }
  const statMessages={NO_DATA:'허용된 가격 기록이 없습니다.',INSUFFICIENT_SAMPLE:'계산에 필요한 가격 표본이 부족합니다.',
    CLOSE_TIME_UNKNOWN:'봉 마감 시각이 UNKNOWN이어서 확정된 가격 표본을 확인할 수 없습니다.',INVALID_SERIES:'가격 또는 시각이 일관되지 않아 계산할 수 없습니다.',
    RIGHTS_RESTRICTED:'가격 자료의 공개·파생 표시 권리가 확인되지 않았습니다.'};
  const percent=value=>new Intl.NumberFormat('ko-KR',{style:'percent',maximumFractionDigits:2}).format(value);
  function renderPriceStatistics(row){
    const performance=$('market-performance'),seasonality=$('market-seasonality');if(!performance||!seasonality)return;
    performance.replaceChildren();seasonality.replaceChildren();
    if(!row.analyses.length){for(const box of [performance,seasonality])box.append(el('p','NO_DATA · '+statMessages.NO_DATA));return;}
    for(const analysis of row.analyses){
      const value=analysis.statistics;performance.append(el('h4',analysis.timeframe+' 가격 관측'));
      seasonality.append(el('h4',analysis.timeframe+' 가격 관측의 월별 요약'));
      if(value.status!=='COMPUTED'){for(const box of [performance,seasonality])box.append(el('p',value.status+' · '+(statMessages[value.status]||'자료를 확인할 수 없습니다.')));continue;}
      performance.append(el('p',`${value.observations}개 확정 가격 · ${value.first_close_at} → ${value.last_close_at}`));
      fields(performance,[['처음 대비 마지막 종가 변화',percent(value.price_return)],['관측 종가 기준 최대 낙폭',percent(value.max_drawdown)]]);
      const seasonal=value.seasonality;seasonality.append(el('p',seasonal.status+' · 인접한 확정 종가의 변화를 UTC 종료 월로 묶었습니다. 누락 구간은 보간하지 않습니다.'));
      const table=el('table',undefined,'data-table');table.append(el('caption','같은 월에 2개 연도·2개 구간 이상 있을 때만 평균을 표시합니다.'));
      const head=el('thead'),line=el('tr');for(const label of ['월','관측 구간','연도 수','평균 구간 수익률'])line.append(el('th',label));head.append(line);
      const body=el('tbody');for(const month of seasonal.months){const tr=el('tr');tr.append(el('th',month.month+'월'));
        for(const [label,text] of [['관측 구간',String(month.samples)],['연도 수',String(month.years)],['평균 구간 수익률',month.status==='COMPUTED'?percent(month.mean_return):'INSUFFICIENT_SAMPLE']]){
          const cell=el('td',text);cell.setAttribute('data-label',label);tr.append(cell);}body.append(tr);}table.append(head,body);
      const scroll=el('div',undefined,'table-scroll');scroll.append(table);seasonality.append(scroll);
    }
  }
  function renderRisk(rows){const box=$('risk-observations');if(!box)return;box.replaceChildren();
    for(const row of rows.filter(item=>item.asset_class==='economy'||item.asset_class==='gov_bond')){
      const value=row.latest_observation;box.append(el('h4',row.name));box.append(el('p',value?
        `${value.value} ${value.units||''} · 관측일 ${value.data_date||'UNKNOWN'}`:row.restricted?'RIGHTS_RESTRICTED · 공개 표시 권리 확인이 필요합니다.':'NO_DATA · 허용된 거시 관측값이 없습니다.'));
      for(const credit of value?.attributions||[])box.append(el('small',credit));
      const link=el('a','거시 기록과 출처 확인');link.href='/record/#market-context';box.append(link);
    }
    if(!rows.some(item=>item.asset_class==='economy'||item.asset_class==='gov_bond'))box.append(el('p','NO_DATA · 등록된 거시 대상이 없습니다.'));
  }

  async function fetchSnapshot(url) {
    const res = await window.fetch(url + '?refresh=' + Math.floor(Date.now() / 60000), {cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined});
    if (!res.ok) throw new Error('transport');
    const data = await res.json();
    if (!data || data.schema !== 'wie.public-live/1') throw new Error('schema');
    return data;
  }

  async function load() {
    say('공개 WIE 기록을 확인하는 중… (loading)');
    try { snapshot = await fetchSnapshot(PRIMARY); }
    catch { try { snapshot = await fetchSnapshot('/wie/live.json'); snapshotError = '자동 갱신 경로에 연결하지 못해 저장된 공개 기록을 씁니다'; } catch { snapshot = null; snapshotError = '공개 기록을 불러오지 못했습니다 (source failure)'; } }
    if (snapshot && firstCoverage?.as_of !== snapshot.observed_at) {
      firstCoverage = null;
      try {
        const res = await window.fetch('/wie/coverage.json', {cache: 'no-store', credentials: 'omit', signal: AbortSignal.timeout(10000)});
        const value = res.ok ? await res.json() : null;
        if (value?.schema === 'migaryos.first-coverage-manifest/1' && value.as_of === snapshot.observed_at) firstCoverage = value;
      } catch { /* absent matching manifest means no current coverage authority */ }
    }
    renderCatalogue(); renderWatchlist(); renderSelected();
  }
  const search = $('symbol-search');
  function choose(item){if(!item)return;unknownSymbol=null;symbolChosen=true;selected=item;renderSelected();$('sel-name')?.focus();}
  if(window.WIESearch&&$('symbol-candidates')?.dataset.autocomplete==='true'){
    const items=window.WIESearch.catalogueItems(registry);
    searchBox=window.WIESearch.mount({document,input:$('symbol-input'),host:$('symbol-candidates'),localItems:()=>items,
      onSelect:item=>choose(item.source),onWatch:staticOnly?null:item=>workspace.toggleSaved(watchTarget(item.source,workspace.state.saved,registry)),
      saved:item=>workspace.state.saved.includes(watchTarget(item.source,workspace.state.saved,registry)),
      watchState:()=>({busy:workspace.busy,readOnly:workspace.state.principal?.role==='viewer',authenticated:!!workspace.state.principal})});
  }
  if (search) search.addEventListener('submit', event => { event.preventDefault();if(searchBox?.suppressSubmit())return;const found = resolveInstrument($('symbol-input').value, registry); if(found){searchBox?.close();choose(found);}else say('일치하는 대상이 없거나 여러 거래소에 있습니다. 검색 후보에서 이름·코드·거래소를 확인해 선택하세요.'); });
  $('market-workspace-refresh')?.addEventListener('click',()=>workspace.refresh());
  const ready=Promise.all([workspace.refresh(),load()]);
  const destroy=()=>{searchBox?.destroy();workspace.destroy();$('watchlist')?.replaceChildren();$('catalogue')?.replaceChildren();};
  window.addEventListener?.('pagehide',destroy);
  window.addEventListener?.('pageshow',event=>{if(event.persisted)window.location.reload();});
  return {workspace,ready,destroy};
}

if (typeof window !== 'undefined' && window.document && window.MARKET_REGISTRY) boot(window);
