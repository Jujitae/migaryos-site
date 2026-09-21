// Reusable Market OHLC input contract and Lightweight Charts renderer.
// This module does not fetch market data. The browser-only fixture path is
// deliberately gated to localhost and an explicit query parameter.

export const MARKET_CHART_SCHEMA = 'migaryos.market-chart-input/1';
export const LIGHTWEIGHT_CHARTS_VERSION = '4.2.3';
const LIGHTWEIGHT_CHARTS_SRC = 'https://unpkg.com/lightweight-charts@4.2.3/dist/lightweight-charts.standalone.production.js';
const SCRIPT_ID = 'migaryos-lightweight-charts-4-2-3';
const MAX_BARS = 10000;

// One routing function is shared by the Market renderer and acceptance
// checks. It follows canonical listing identity and never substitutes SPY,
// futures, or CFD data for the SPX cash index.
export function marketProviderRoute(instrument) {
  if (!instrument || typeof instrument !== 'object') return {status: 'NO_ROUTE'};
  const region = String(instrument.region || '').toUpperCase();
  if (instrument.id === 'SPX' || instrument.listing_id === 'US:SP:SPX') return {status: 'PUBLIC_GAP', provider: 'spx-separate', reason: 'SPX_PUBLIC_CHART_REMAINING'};
  if (region === 'KR' && /^\d{6}$/.test(String(instrument.symbol || ''))) {
    return {status: 'ROUTED', provider: 'data.go.kr', provider_symbol: instrument.symbol,
      operation: instrument.asset_class === 'etf' ? 'getSecuritiesPriceInfo' : 'getStockPriceInfo', mode: 'server-adapter'};
  }
  if (instrument.tradingview && (region === 'US' || region === 'KR')) return {status: 'ROUTED', provider: 'tradingview-embed', provider_symbol: instrument.tradingview, mode: 'official-widget'};
  return {status: 'NO_ROUTE'};
}

const text = value => typeof value === 'string' && value.trim() ? value.trim() : 'UNKNOWN';
const finite = value => typeof value === 'number' && Number.isFinite(value);

function epochSeconds(value) {
  if (finite(value)) return value;
  if (typeof value !== 'string') return NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
}

function normalizeBars(rows) {
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_BARS) return {ok: false, status: 'INVALID_BARS'};
  const bars = [];
  let previous = -Infinity;
  for (const row of rows) {
    const time = epochSeconds(row?.time);
    const open = row?.open, high = row?.high, low = row?.low, close = row?.close;
    if (!Number.isInteger(time) || time <= previous || ![open, high, low, close].every(finite) || open <= 0 || high <= 0 || low <= 0 || close <= 0 ||
      high < Math.max(open, close) || low > Math.min(open, close)) return {ok: false, status: 'INVALID_BARS'};
    bars.push({time, open, high, low, close});
    previous = time;
  }
  return {ok: true, bars};
}

export function normalizeChartInput(input) {
  const instrument = input?.instrument || {};
  const canonicalId = text(instrument.canonical_id || instrument.entity_id);
  const instrumentId = text(instrument.id || instrument.instrument_id);
  const name = text(instrument.name);
  if ([canonicalId, instrumentId, name].includes('UNKNOWN')) return {ok: false, status: 'INVALID_IDENTITY'};
  const normalized = normalizeBars(input?.bars);
  if (!normalized.ok) return normalized;
  const evidenceKind = input?.evidence_kind === 'SYNTHETIC' ? 'SYNTHETIC' : input?.evidence_kind === 'OBSERVED' ? 'OBSERVED' : 'UNKNOWN';
  if (evidenceKind === 'UNKNOWN') return {ok: false, status: 'EVIDENCE_KIND_REQUIRED'};
  const rights = input?.rights && typeof input.rights === 'object' ? input.rights : {};
  const displayStatus = evidenceKind === 'SYNTHETIC' ? 'SYNTHETIC_ONLY' : text(rights.public_display) === 'ALLOW' ? 'PUBLIC_DISPLAY_ALLOWED' : 'RIGHTS_RESTRICTED';
  return {
    ok: true,
    schema: MARKET_CHART_SCHEMA,
    instrument: {canonical_id: canonicalId, id: instrumentId, name, currency: text(instrument.currency)},
    bars: normalized.bars,
    source: {
      provider: text(input?.source?.provider), provider_symbol: text(input?.source?.provider_symbol),
      exchange: text(input?.source?.exchange), timezone: text(input?.source?.timezone),
      session: text(input?.source?.session), adjustment: text(input?.source?.adjustment),
    },
    data_as_of: input?.data_as_of || null,
    observed_at: input?.observed_at || null,
    evidence_kind: evidenceKind,
    rights: {public_display: text(rights.public_display), derived_output: text(rights.derived_output),
      redistribution: text(rights.redistribution), allowed_scope: text(rights.allowed_scope)},
    observed_status: text(input?.observed_status),
    generated_at: input?.generated_at || null,
    display_status: displayStatus,
  };
}

const FIXTURE_PROFILES = Object.freeze({
  SPX: {base: 5200, step: 1.8, phase: .4, currency: 'USD', exchange: 'CBOE/INDEX_FIXTURE', timezone: 'America/New_York'},
  SAMSUNG: {base: 72000, step: 150, phase: 1.2, currency: 'KRW', exchange: 'XKRX', timezone: 'Asia/Seoul'},
  AAPL: {base: 185, step: .28, phase: 2.1, currency: 'USD', exchange: 'XNAS', timezone: 'America/New_York'},
  NVDA: {base: 118, step: .55, phase: 2.7, currency: 'USD', exchange: 'XNAS', timezone: 'America/New_York'},
});

export function syntheticFixtureForInstrument(instrument) {
  const profile = FIXTURE_PROFILES[instrument?.id] || {base: 100, step: 1, phase: 0, currency: 'UNKNOWN', exchange: 'UNKNOWN', timezone: 'UTC'};
  const bars = [];
  let value = profile.base;
  for (let i = 0; i < 60; i += 1) {
    const drift = Math.sin(i * .37 + profile.phase) * profile.step + Math.cos(i * .13) * profile.step * .45;
    const open = value;
    const close = Math.max(.01, open + drift + (i % 7 === 0 ? profile.step * .9 : 0));
    const high = Math.max(open, close) + profile.step * (.6 + ((i * 3) % 5) * .14);
    const low = Math.min(open, close) - profile.step * (.5 + ((i * 2) % 4) * .12);
    bars.push({time: Math.floor(Date.UTC(2026, 0, 2 + i) / 1000), open: +open.toFixed(2), high: +high.toFixed(2), low: +low.toFixed(2), close: +close.toFixed(2)});
    value = close;
  }
  return normalizeChartInput({
    instrument: {canonical_id: instrument?.entity_id, id: instrument?.id, name: instrument?.name, currency: profile.currency},
    bars,
    source: {provider: 'MIGARYOS_SYNTHETIC_FIXTURE', provider_symbol: instrument?.tradingview || instrument?.id, exchange: profile.exchange, timezone: profile.timezone, session: 'synthetic-fixture', adjustment: 'none'},
    data_as_of: new Date(bars.at(-1).time * 1000).toISOString(), observed_at: null,
    evidence_kind: 'SYNTHETIC', rights: {public_display: 'DENY', derived_output: 'DENY'},
  });
}

export function syntheticFixtureEnabled(window, params) {
  const host = String(window?.location?.hostname || '').toLowerCase();
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) && params?.get('market_fixture') === 'synthetic';
}

export function localChartEnabled(window, params) {
  const host = String(window?.location?.hostname || '').toLowerCase();
  return ['localhost', '127.0.0.1', '::1', '[::1]'].includes(host) && params?.get('market_fixture') !== 'synthetic';
}

// Lightweight Charts creates an internal canvas at the width supplied here.
// Clamp it to the visible viewport as well as the host so a narrow page cannot
// expose the chart's right price scale outside the reading surface.
export function chartWidthForHost(window, host) {
  const rect = typeof host?.getBoundingClientRect === 'function' ? host.getBoundingClientRect() : null;
  const measured = Number(host?.clientWidth) || Number(rect?.width) || 320;
  const viewport = Number(window?.document?.documentElement?.clientWidth) || Number(window?.innerWidth);
  if (!Number.isFinite(viewport) || viewport <= 0 || !rect || !Number.isFinite(rect.left)) return Math.max(1, Math.floor(measured));
  const available = viewport - Math.max(0, rect.left) - 1;
  return Math.max(1, Math.floor(Math.min(measured, available)));
}

function loadLightweightCharts(window) {
  if (window?.LightweightCharts) return Promise.resolve(window.LightweightCharts);
  const document = window?.document;
  if (!document) return Promise.reject(new Error('DOCUMENT_UNAVAILABLE'));
  const existing = document.getElementById(SCRIPT_ID);
  if (existing && window.__MIGARYOS_LIGHTWEIGHT_CHARTS_PROMISE__) return window.__MIGARYOS_LIGHTWEIGHT_CHARTS_PROMISE__;
  const script = existing || document.createElement('script');
  script.id = SCRIPT_ID; script.async = true; script.src = LIGHTWEIGHT_CHARTS_SRC;
  const promise = new Promise((resolve, reject) => {
    script.addEventListener('load', () => window.LightweightCharts ? resolve(window.LightweightCharts) : reject(new Error('LIBRARY_GLOBAL_MISSING')), {once: true});
    script.addEventListener('error', () => reject(new Error('LIBRARY_LOAD_FAILED')), {once: true});
  });
  window.__MIGARYOS_LIGHTWEIGHT_CHARTS_PROMISE__ = promise;
  if (!existing) (document.head || document.documentElement).appendChild(script);
  return promise;
}

function field(document, parent, label, value) {
  const row = document.createElement('div');
  const name = document.createElement('b'); name.textContent = label;
  const content = document.createElement('span'); content.textContent = value;
  row.append(name, content); parent.append(row);
}

export function mountLightweightChart({window, document, host, input}) {
  const model = input?.ok ? input : normalizeChartInput(input);
  let chart = null, observer = null, resizeHandler = null, cancelled = false;
  host.className = 'market-candle-chart'; host.replaceChildren(); host.setAttribute('data-evidence-kind', model.ok ? model.evidence_kind : 'UNKNOWN');
  const title = document.createElement('h4'); title.textContent = model.ok ? `${model.instrument.name} · Lightweight Charts` : '캔들 차트를 표시할 수 없습니다'; host.append(title);
  const status = document.createElement('p'); status.className = 'market-candle-chart-status'; status.textContent = model.ok ? `${model.display_status} · ${model.bars.length}개 봉${model.observed_status !== 'UNKNOWN' ? ` · ${model.observed_status}` : ''}` : `${model.status} · 입력 계약을 확인할 수 없습니다`; host.append(status);
  if (!model.ok) return {ready: Promise.resolve(model), destroy() {cancelled = true;}};
  const metadata = document.createElement('div'); metadata.className = 'market-candle-chart-metadata';
  field(document, metadata, 'Canonical ID', model.instrument.canonical_id); field(document, metadata, '통화', model.instrument.currency);
  field(document, metadata, 'Source', model.source.provider); field(document, metadata, 'Data as of', model.data_as_of || 'UNKNOWN');
  field(document, metadata, 'Public display', model.rights.public_display); host.append(metadata);
  const chartHost = document.createElement('div'); chartHost.className = 'market-candle-chart-canvas'; host.append(chartHost);
  const attribution = document.createElement('p'); attribution.className = 'market-candle-chart-attribution';
  const link = document.createElement('a');
  if (model.source.provider === 'data.go.kr') { link.href = model.source.url !== 'UNKNOWN' ? model.source.url : 'https://www.data.go.kr/data/15094808/openapi.do'; link.textContent = '자료 출처: 금융위원회 공공데이터포털'; }
  else { link.href = 'https://tradingview.com'; link.textContent = 'Charting by TradingView'; }
  link.target = '_blank'; link.rel = 'noreferrer';
  attribution.append(link); host.append(attribution);
  const ready = loadLightweightCharts(window).then(LightweightCharts => {
    if (cancelled) return model;
    chart = LightweightCharts.createChart(chartHost, {width: chartWidthForHost(window, chartHost), height: 330,
      layout: {background: {color: '#ffffff'}, textColor: '#334155'}, grid: {vertLines: {color: '#e2e8f0'}, horzLines: {color: '#e2e8f0'}},
      rightPriceScale: {borderColor: '#cbd5e1'}, timeScale: {borderColor: '#cbd5e1', timeVisible: false}});
    const series = chart.addCandlestickSeries({upColor: '#16a34a', downColor: '#dc2626', borderVisible: false, wickUpColor: '#16a34a', wickDownColor: '#dc2626'});
    series.setData(model.bars); chart.timeScale().fitContent();
    const resize = width => {
      const visible = chartWidthForHost(window, chartHost);
      const observed = Number(width);
      chart?.applyOptions({width: Math.max(1, Math.floor(Math.min(visible, Number.isFinite(observed) && observed > 0 ? observed : visible))) });
    };
    if (window.ResizeObserver) { observer = new window.ResizeObserver(entries => resize(entries[0]?.contentRect?.width)); observer.observe(chartHost); }
    else { resizeHandler = () => resize(chartHost.clientWidth); window.addEventListener('resize', resizeHandler); }
    return model;
  }).catch(error => { if (!cancelled) status.textContent = `RENDERER_LOAD_FAILED · ${error.message}`; return {...model, render_status: 'RENDERER_LOAD_FAILED'}; });
  return {ready, destroy() { cancelled = true; observer?.disconnect(); if (resizeHandler) window.removeEventListener('resize', resizeHandler); chart?.remove(); }};
}
