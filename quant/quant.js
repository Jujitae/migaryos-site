// Research UI for the public Quant surface. It builds the same wie.quant-request/1
// object consumed by the local/private Python engine. Public static hosting never
// pretends to be that engine: users get a truthful preview and an exportable path.

const DATA_KINDS = Object.freeze({
  'stat-arb': 'paired-prices',
  'factor-decomp': 'factor-returns',
  'vol-surface': 'option-quotes',
  'insider-cluster': 'public-filings',
});

const FIELD = Object.freeze({
  'stat-arb': 'pair',
  'factor-decomp': 'single',
  'vol-surface': 'single',
  'insider-cluster': 'single',
});

const clean = value => typeof value === 'string' ? value.normalize('NFC').trim() : '';
const list = value => Array.isArray(value) ? value : [];

function sourceOf(instrument) {
  return instrument?.source && typeof instrument.source === 'object' ? instrument.source : (instrument || {});
}

function symbolOf(instrument) {
  const source = sourceOf(instrument);
  return clean(source.symbol) || clean(source.id) || clean(instrument?.code) || clean(instrument?.id);
}

function familyMetadata(ui, family) {
  return ui?.families?.[family] || null;
}

function defaultConfig(ui, family) {
  return Object.fromEntries(list(familyMetadata(ui, family)?.parameters).map(parameter => [parameter.key, parameter.default]));
}

function valueFor(parameter, value) {
  if (value === '' || value === undefined || value === null) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metadataFor(instrument, family, asOf, evidenceKind, rowCount, pairInstrument = null) {
  const source = sourceOf(instrument);
  const symbol = symbolOf(instrument);
  const pairSymbol = symbolOf(pairInstrument);
  const symbols = FIELD[family] === 'pair' ? [symbol, pairSymbol || (symbol ? `${symbol}:PAIR_REQUIRED` : 'PAIR_REQUIRED')] : [symbol];
  return {
    dataset_id: evidenceKind === 'SYNTHETIC' ? 'synthetic-contract-test' : `catalogue:${clean(source.entity_id) || symbol || 'unselected'}:draft`,
    source_id: evidenceKind === 'SYNTHETIC' ? 'fixture' : `public:${clean(source.entity_id) || symbol || 'unselected'}`,
    provider: evidenceKind === 'SYNTHETIC' ? 'synthetic-fixture' : 'public-research-dataset-unconnected',
    exchange: evidenceKind === 'SYNTHETIC' ? 'SIMULATED' : clean(source.exchange) || 'UNKNOWN',
    timezone: evidenceKind === 'SYNTHETIC' ? 'UTC' : 'UTC',
    session: evidenceKind === 'SYNTHETIC' ? 'synthetic-daily' : 'UNKNOWN',
    adjustment: evidenceKind === 'SYNTHETIC' ? 'none' : 'UNKNOWN',
    currency: evidenceKind === 'SYNTHETIC' ? 'USD' : clean(source.currency) || 'UNKNOWN',
    units: {price: evidenceKind === 'SYNTHETIC' ? 'USD' : clean(source.currency) || 'UNKNOWN', return: 'decimal', volume: 'shares', option_volume: 'contracts'},
    symbols,
    data_kind: DATA_KINDS[family],
    evidence_kind: evidenceKind,
    retrieved_at: asOf,
    source_uri: evidenceKind === 'SYNTHETIC' ? 'fixture://quant/test' : 'unavailable://public-research-dataset',
    timestamp_semantics: 'event_and_availability',
    sampling_interval_seconds: 86400,
    periods_per_year: 252,
    expected_rows: rowCount,
    max_age_seconds: 86400,
  };
}

/** Build the canonical engine input. A real public target is intentionally a
 * zero-row draft until an authorized data adapter supplies point-in-time rows. */
export function buildRequest({ui, family, instrument = null, pairInstrument = null, periodEnd = null, dataMode = 'public', config = {}, fixture = null} = {}) {
  const familyConfig = defaultConfig(ui, family);
  for (const [key, value] of Object.entries(config || {})) if (Object.prototype.hasOwnProperty.call(familyConfig, key)) familyConfig[key] = valueFor(null, value);
  const useFixture = dataMode === 'synthetic' && family === 'stat-arb' && fixture && fixture.schema === 'wie.quant-request/1';
  if (useFixture) {
    const request = structuredClone(fixture);
    request.config = {...request.config, ...familyConfig};
    return request;
  }
  const asOf = Number.isFinite(Number(periodEnd)) ? Math.floor(Number(periodEnd)) : Math.floor(Date.now() / 1000);
  const metadata = metadataFor(instrument, family, asOf, 'OBSERVED', 0, pairInstrument);
  return {
    schema: 'wie.quant-request/1',
    family,
    as_of: asOf,
    dataset: {schema: 'wie.quant-dataset/1', metadata, rows: []},
    config: familyConfig,
  };
}

function freshness(request) {
  const rows = list(request?.dataset?.rows);
  const asOf = Number(request?.as_of);
  const meta = request?.dataset?.metadata || {};
  const last = rows.at(-1);
  if (!rows.length || !Number.isFinite(asOf) || !last) return {state: 'NO_DATA', visible: 0, missing: Number(meta.expected_rows) || 0};
  const visible = rows.filter(row => Number(row.available_at) <= asOf && Number(row.event_at) <= asOf);
  const missing = Math.max(0, (Number(meta.expected_rows) || 0) - rows.length);
  const age = asOf - Number(visible.at(-1)?.event_at);
  return {state: age <= (Number(meta.max_age_seconds) || 86400) ? 'FRESH' : 'STALE', visible: visible.length, missing};
}

/** Produce a user-facing input receipt without claiming a run or inventing data. */
export function previewFor({request, family, instrument = null, dataMode = 'public'} = {}) {
  const source = sourceOf(instrument);
  const sample = freshness(request);
  if (dataMode === 'synthetic' && family === 'stat-arb' && sample.visible > 0) {
    return {
      availability: 'LOCAL_SYNTHETIC_READY', label: 'SYNTHETIC · 로컬 엔진 입력 준비됨', evidence: 'SYNTHETIC',
      rows: sample.visible, missing: sample.missing, source: request.dataset.metadata.provider,
      freshness: sample.state, execution: 'AGENT_OR_LOCAL_EXPORT', detail: '공개 계산 서버가 아니라 로컬/private CLI로 실행합니다.',
    };
  }
  const restricted = clean(source.exchange).toUpperCase() === 'KRX' || clean(source.currency).toUpperCase() === 'KRW';
  return {
    availability: restricted ? 'RESTRICTED_UNKNOWN_RIGHTS' : 'UNAVAILABLE_PUBLIC_DATASET',
    label: restricted ? 'RESTRICTED · 공개 연구 입력 권리/어댑터 미확인' : 'UNAVAILABLE · 공개 연구 데이터셋 미연결',
    evidence: 'OBSERVED_DECLARATION_ONLY', rows: 0, missing: 0,
    source: request.dataset.metadata.provider, freshness: 'NO_DATA', execution: 'AGENT_OR_LOCAL_EXPORT',
    detail: restricted ? '카탈로그 신원은 확인되지만 KRX/DART 연구 입력의 공개 사용 계약은 현재 확인되지 않았습니다.' : '카탈로그 신원은 데이터·유동성·연구 실행 가능성을 보장하지 않습니다.',
  };
}

function pathValue(object, path) {
  return path.split('.').reduce((value, key) => value == null ? undefined : value[key], object);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, character => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[character]));
}

function boot() {
  if (typeof document === 'undefined' || !window.QUANT_UI) return;
  const ui = window.QUANT_UI;
  const registry = window.QUANT_REGISTRY || {};
  const fixture = window.QUANT_FIXTURE || null;
  const byId = id => document.getElementById(id);
  const state = {family: 'factor-decomp', period: '1Y', mode: 'public', target: null, pairTarget: null, config: {}, request: null, result: null};
  const searchInput = byId('quant-target-input');

  function urlContext() {
    const params = new URLSearchParams(window.location.search);
    return {entity: clean(params.get('entity')), symbol: clean(params.get('symbol')),
      pair_entity: clean(params.get('pair_entity')), pair_symbol: clean(params.get('pair_symbol'))};
  }

  function rawSource() { return sourceOf(state.target); }
  function selectedSymbol() { return symbolOf(state.target); }

  function syncUrl() {
    const params = new URLSearchParams(window.location.search);
    // Preserve an incoming target while the async catalogue restore is in flight.
    // A blank initial state must not erase Market → Quant context on first paint.
    if (state.target && rawSource().entity_id) params.set('entity', rawSource().entity_id);
    if (state.target && rawSource().symbol) params.set('symbol', rawSource().symbol);
    if (state.pairTarget && sourceOf(state.pairTarget).entity_id) params.set('pair_entity', sourceOf(state.pairTarget).entity_id);
    if (state.pairTarget && sourceOf(state.pairTarget).symbol) params.set('pair_symbol', sourceOf(state.pairTarget).symbol);
    params.set('family', state.family); params.set('period', state.period);
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
    document.querySelectorAll('a[data-preserve-context]').forEach(link => {
      const href = new URL(link.getAttribute('href'), window.location.origin);
      for (const key of ['entity', 'symbol', 'pair_entity', 'pair_symbol']) { if (params.get(key)) href.searchParams.set(key, params.get(key)); else href.searchParams.delete(key); }
      link.href = href.pathname + (href.search ? href.search : '') + href.hash;
    });
  }

  function showTarget() {
    const source = rawSource();
    const box = byId('quant-target-summary');
    if (!state.target || !source.entity_id) {
      box.className = 'quant-card empty'; box.innerHTML = '<strong>대상을 선택하세요</strong><span>검색 결과에서 정확한 listing을 골라야 연구 요청에 신원이 들어갑니다.</span>'; return;
    }
    const name = clean(source.name) || clean(state.target.name) || selectedSymbol();
    box.className = 'quant-card selected';
    box.innerHTML = `<strong>${escapeHtml(name)} · ${escapeHtml(source.symbol || selectedSymbol())}</strong><span>${escapeHtml(source.exchange || '거래소 미확인')} · ${escapeHtml(source.currency || '통화 미확인')} · ${escapeHtml(source.listing_type || source.asset_class || '종류 미확인')}</span><small>canonical entity · ${escapeHtml(source.entity_id)}</small>`;
  }

  function showPairTarget() {
    const selector = byId('quant-pair-selector'); if (!selector) return;
    selector.hidden = state.family !== 'stat-arb';
    if (state.family !== 'stat-arb') return;
    const source = sourceOf(state.pairTarget); const box = byId('quant-pair-summary');
    if (!state.pairTarget || !source.entity_id) { box.className = 'quant-card empty'; box.innerHTML = '<strong>두 번째 listing을 선택하세요</strong><span>stat-arb는 서로 다른 두 심볼의 paired-prices가 필요합니다.</span>'; return; }
    box.className = 'quant-card selected'; box.innerHTML = `<strong>${escapeHtml(source.name || sourceOf(state.pairTarget).name || symbolOf(state.pairTarget))} · ${escapeHtml(source.symbol || symbolOf(state.pairTarget))}</strong><span>${escapeHtml(source.exchange || '거래소 미확인')} · ${escapeHtml(source.currency || '통화 미확인')}</span><small>canonical entity · ${escapeHtml(source.entity_id)}</small>`;
  }

  function renderFamilies() {
    const host = byId('quant-family-cards'); host.replaceChildren();
    for (const [id, meta] of Object.entries(ui.families || {})) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `quant-family-card${id === state.family ? ' active' : ''}`;
      button.setAttribute('aria-pressed', String(id === state.family));
      const fixtureNote = id === 'stat-arb' ? '<small>SYNTHETIC fixture 제공</small>' : '<small>사용자 데이터셋 필요</small>';
      button.innerHTML = `<strong>${escapeHtml(meta.name_ko)}<br><span>${escapeHtml(meta.label)}</span></strong><span>${escapeHtml(meta.description)}</span><em>${escapeHtml(meta.data_requirement)}</em><small>실행 · local/private CLI · public compute 없음</small>${fixtureNote}`;
      button.addEventListener('click', () => { state.family = id; state.config = {}; state.result = null; renderFamilies(); renderParameters(); showPairTarget(); renderPreview(); syncUrl(); });
      host.append(button);
    }
  }

  function renderPeriods() {
    const host = byId('quant-periods'); host.replaceChildren();
    for (const period of list(ui.periods)) {
      const button = document.createElement('button'); button.type = 'button'; button.className = `period-button${period.id === state.period ? ' active' : ''}`; button.textContent = period.label;
      button.setAttribute('aria-pressed', String(period.id === state.period));
      button.addEventListener('click', () => { state.period = period.id; renderPeriods(); renderPreview(); syncUrl(); }); host.append(button);
    }
    byId('quant-custom-period').hidden = state.period !== 'custom';
  }

  function renderModes() {
    for (const [id, mode] of [['quant-mode-public', 'public'], ['quant-mode-synthetic', 'synthetic']]) {
      const button = byId(id); if (!button) continue;
      button.classList.toggle('active', state.mode === mode); button.setAttribute('aria-pressed', String(state.mode === mode));
      button.onclick = () => { state.mode = mode; renderModes(); renderPreview(); };
    }
  }

  function renderParameters() {
    const meta = familyMetadata(ui, state.family); const core = byId('quant-parameters'); const advanced = byId('quant-advanced-parameters'); core.replaceChildren(); advanced.replaceChildren();
    for (const parameter of list(meta?.parameters)) {
      const label = document.createElement('label'); label.className = parameter.advanced ? 'advanced-param' : '';
      const input = document.createElement('input'); input.type = parameter.type; input.name = parameter.key; input.inputMode = 'decimal'; input.step = parameter.step; input.min = parameter.min; input.max = parameter.max;
      const current = Object.prototype.hasOwnProperty.call(state.config, parameter.key) ? state.config[parameter.key] : parameter.default;
      input.value = current == null ? '' : String(current); input.dataset.parameter = parameter.key;
      input.addEventListener('input', () => { state.config[parameter.key] = input.value === '' ? null : Number(input.value); renderPreview(); });
      label.append(document.createElement('span'), input); label.firstChild.textContent = parameter.label;
      (parameter.advanced ? advanced : core).append(label);
    }
    byId('quant-advanced-parameter-details').hidden = advanced.children.length === 0;
  }

  function periodEnd() {
    if (state.period === 'custom') {
      const value = byId('quant-custom-end').value;
      const timestamp = Date.parse(value);
      if (Number.isFinite(timestamp)) return Math.floor(timestamp / 1000);
    }
    const period = list(ui.periods).find(item => item.id === state.period);
    if (period?.days && fixture && state.mode === 'synthetic') return fixture.as_of;
    return Math.floor(Date.now() / 1000);
  }

  function getRequest() {
    return buildRequest({ui, family: state.family, instrument: state.target, pairInstrument: state.pairTarget, periodEnd: periodEnd(), dataMode: state.mode, config: state.config, fixture});
  }

  function renderPreview() {
    state.request = getRequest();
    const preview = previewFor({request: state.request, family: state.family, instrument: state.target, dataMode: state.mode});
    const source = state.request.dataset.metadata;
    const meta = familyMetadata(ui, state.family);
    byId('quant-preview').innerHTML = `<div class="preview-status ${preview.availability.toLowerCase()}"><strong>${escapeHtml(preview.label)}</strong><span>${escapeHtml(preview.detail)}</span></div><dl class="preview-grid"><dt>Instrument / universe</dt><dd>${escapeHtml(selectedSymbol() || '선택되지 않음')}${state.family === 'stat-arb' ? ` · pair ${escapeHtml(symbolOf(state.pairTarget) || '두 번째 listing 필요')}` : ''} · ${escapeHtml(source.exchange || '—')}</dd><dt>Period</dt><dd>${escapeHtml(state.period)} · as_of ${escapeHtml(new Date(Number(state.request.as_of) * 1000).toISOString())}</dd><dt>Research type</dt><dd>${escapeHtml(meta?.name_ko || state.family)} · ${escapeHtml(state.family)}</dd><dt>Rows</dt><dd>${preview.rows} · missing ${preview.missing}</dd><dt>Data source</dt><dd>${escapeHtml(preview.source)}</dd><dt>Evidence</dt><dd>${escapeHtml(preview.evidence)}</dd><dt>Freshness / as-of</dt><dd>${escapeHtml(preview.freshness)}</dd><dt>Availability</dt><dd>${escapeHtml(preview.availability)}</dd><dt>Execution status</dt><dd>${escapeHtml(preview.execution)} · public compute 없음</dd></dl>`;
    byId('quant-family-limitation').textContent = meta?.limitation || '';
    byId('quant-request-json').value = JSON.stringify(state.request, null, 2);
    byId('quant-run-command').textContent = `python -m wie.quant_research research --input REQUEST.json`;
    byId('quant-action-note').textContent = preview.rows ? '이 요청은 로컬/private CLI에서 계산할 수 있습니다. 공개 Run 버튼은 제공하지 않습니다.' : '현재 입력 행이 없어 계산할 수 없습니다. 실제 데이터셋을 Advanced에서 공급하거나 synthetic fixture를 선택하세요.';
    syncUrl();
  }

  function chooseTarget(item) { state.target = item; showTarget(); renderPreview(); syncUrl(); }
  function choosePair(item) { state.pairTarget = item; showPairTarget(); renderPreview(); syncUrl(); }

  async function restoreTarget() {
    const context = urlContext(); if (!context.entity && !context.symbol && !context.pair_entity && !context.pair_symbol) return;
    try {
      const loader = window.WIESearch?.catalogueSearchLoader(window.fetch.bind(window));
      if (!loader) return;
      const results = await loader({query: context.symbol || context.entity});
      const found = results.find(item => sourceOf(item).entity_id === context.entity || sourceOf(item).symbol === context.symbol || sourceOf(item).id === context.symbol);
      if (found) chooseTarget(found);
      if (context.pair_entity || context.pair_symbol) {
        const pairResults = await loader({query: context.pair_symbol || context.pair_entity});
        const pair = pairResults.find(item => sourceOf(item).entity_id === context.pair_entity || sourceOf(item).symbol === context.pair_symbol || sourceOf(item).id === context.pair_symbol);
        if (pair) choosePair(pair);
      }
    } catch { byId('quant-target-status').textContent = '카탈로그를 다시 확인하지 못했습니다. 검색으로 대상을 선택해 주세요.'; }
  }

  function renderResult(result) {
    const host = byId('quant-result'); state.result = result;
    if (!result) { host.innerHTML = '<p class="muted">아직 공개 결과 artifact가 없습니다. 로컬 결과 JSON을 Advanced에서 불러오면 이곳에 실제 필드만 표시합니다.</p>'; return; }
    if (result.schema !== 'wie.quant-result/1') { host.innerHTML = '<p class="notice">wie.quant-result/1이 아닌 파일은 결과로 표시하지 않습니다.</p>'; return; }
    const metricNames = {net_mean: 'OOS net mean', sharpe: 'Sharpe', max_drawdown: 'Max drawdown', trade_count: 'Trade count'};
    const metrics = Object.entries(metricNames).map(([key, label]) => [label, pathValue(result, `backtest.metrics.${key}`)]).filter(([, value]) => value !== undefined && value !== null);
    const sample = pathValue(result, 'diagnostics.sample.visible_rows');
    const comparison = result.comparison || result.baseline;
    host.innerHTML = `<div class="result-status"><strong>${escapeHtml(result.computation_status || 'UNKNOWN')}</strong><span>${escapeHtml(result.validation_status || 'UNVALIDATED')} · orders ${escapeHtml(result.orders || 'OFF')}</span></div><dl class="preview-grid"><dt>Research type</dt><dd>${escapeHtml(result.family)}</dd><dt>Target / period</dt><dd>${escapeHtml(rawSource().entity_id || result.provenance?.symbols?.join(', ') || 'request provenance')}</dd><dt>Run status</dt><dd>${escapeHtml(result.computation_status || '—')}</dd><dt>Sample size</dt><dd>${escapeHtml(sample ?? '—')}</dd><dt>Evidence</dt><dd>${escapeHtml(result.provenance?.evidence_kind || '—')}</dd><dt>Generated at</dt><dd>${escapeHtml(result.generated_at || 'result schema에 없음')}</dd></dl><div class="metric-grid">${metrics.length ? metrics.map(([label, value]) => `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(typeof value === 'number' ? value.toPrecision(6) : value)}</strong></div>`).join('') : '<p class="muted">표시할 실제 metric이 없습니다.</p>'}</div><p class="muted">${comparison ? '비교 artifact가 포함되어 있습니다.' : '비교 가능한 baseline/previous run artifact가 없습니다.'}</p><details><summary>제한과 blockers</summary><p>${escapeHtml(list(result.blockers).join(' · ') || '—')}</p></details>`;
  }

  function wireActions() {
    byId('quant-preview-button').addEventListener('click', () => { renderPreview(); byId('quant-preview').scrollIntoView({behavior: 'smooth', block: 'start'}); });
    byId('quant-download').addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state.request, null, 2) + '\n'], {type: 'application/json'}); const url = URL.createObjectURL(blob); const anchor = document.createElement('a'); anchor.href = url; anchor.download = `migaryos-${state.family}-request.json`; anchor.click(); URL.revokeObjectURL(url); byId('quant-action-note').textContent = 'canonical request JSON을 다운로드했습니다.';
    });
    byId('quant-copy').addEventListener('click', async () => { try { await navigator.clipboard.writeText(JSON.stringify(state.request, null, 2)); byId('quant-action-note').textContent = 'canonical request JSON을 클립보드에 복사했습니다.'; } catch { byId('quant-action-note').textContent = '클립보드 접근이 없어 다운로드를 사용하세요.'; } });
    byId('quant-raw-apply').addEventListener('click', () => { try { const value = JSON.parse(byId('quant-request-json').value); if (value.schema !== 'wie.quant-request/1') throw new Error('schema'); state.request = value; state.family = value.family; state.mode = value.dataset?.metadata?.evidence_kind === 'SYNTHETIC' ? 'synthetic' : 'public'; renderFamilies(); renderParameters(); renderModes(); const preview = previewFor({request: value, family: state.family, instrument: state.target, dataMode: state.mode}); byId('quant-action-note').textContent = `raw request 적용됨 · ${preview.availability}`; byId('quant-preview').innerHTML = `<div class="preview-status ${preview.availability.toLowerCase()}"><strong>${escapeHtml(preview.label)}</strong><span>${escapeHtml(preview.detail)}</span></div><dl class="preview-grid"><dt>Research type</dt><dd>${escapeHtml(value.family)}</dd><dt>Rows</dt><dd>${preview.rows} · missing ${preview.missing}</dd><dt>Evidence</dt><dd>${escapeHtml(preview.evidence)}</dd><dt>Availability</dt><dd>${escapeHtml(preview.availability)}</dd></dl>`; } catch { byId('quant-action-note').textContent = '유효한 wie.quant-request/1 JSON만 적용할 수 있습니다.'; } });
    byId('quant-result-file').addEventListener('change', async event => { const file = event.target.files?.[0]; if (!file) return; try { renderResult(JSON.parse(await file.text())); } catch { renderResult({schema: 'invalid'}); } });
  }

  renderFamilies(); renderPeriods(); renderParameters(); renderModes(); showTarget(); showPairTarget(); wireActions(); renderPreview();
  if (window.WIESearch && searchInput) {
    const host = byId('quant-search-host'); const loader = window.WIESearch.catalogueSearchLoader(window.fetch.bind(window));
    window.WIESearch.mount({document, input: searchInput, host, loadItems: loader, localItems: () => [], onSelect: chooseTarget});
    const pairInput = byId('quant-pair-input');
    if (pairInput) window.WIESearch.mount({document, input: pairInput, host: byId('quant-pair-search-host'), loadItems: loader, localItems: () => [], onSelect: choosePair});
  }
  restoreTarget();
}

if (typeof window !== 'undefined') {
  window.MIGARYOSQuant = {buildRequest, previewFor, familyMetadata, DATA_KINDS};
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
}
