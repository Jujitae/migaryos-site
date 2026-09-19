// World Interface — deterministic core.
//
// Runs unchanged in the Cloudflare Worker and in the browser fallback. It has
// no I/O and no clock: the caller supplies the records, the question, and the
// `as_of` boundary. Retrieved records are evidence, never instructions; the
// only thing this module ever does with their text is quote it.
//
// Answer contract (shared with the Python projection and the UI):
//   { answer, evidence:[{id,type,title,locator}], confidence, as_of,
//     retrieval_count, status, intent }
// `status` is one of OK · NO_EVIDENCE · PROJECTION_STALE; the transport adds
// its own refusals (rate limit, budget, origin) before this module runs.

export const INTENTS = Object.freeze({
  RECENT_PREDICTIONS: 'RECENT_PREDICTIONS',
  PREDICTION_OUTCOME: 'PREDICTION_OUTCOME',
  HIT_RATE: 'HIT_RATE',
  BIGGEST_MISS: 'BIGGEST_MISS',
  JOURNAL_THEMES: 'JOURNAL_THEMES',
  WHY_PREDICTED: 'WHY_PREDICTED',
  SHOW_RECORD: 'SHOW_RECORD',
  THOUGHTS_BEFORE: 'THOUGHTS_BEFORE',
  SEARCH: 'SEARCH',
  EMPTY: 'EMPTY',
});

// Intents whose deterministic answer may be rephrased by a language model.
// Everything else is a ledger lookup and is served verbatim.
export const SYNTHESIS_INTENTS = new Set([INTENTS.JOURNAL_THEMES, INTENTS.WHY_PREDICTED, INTENTS.THOUGHTS_BEFORE]);

export const NO_EVIDENCE_ANSWER = '확인할 근거가 없습니다.';
export const RESOLVED_OUTCOMES = new Set(['occurred', 'did_not_occur', 'partial']);
export const OUTCOME_LABELS = Object.freeze({occurred: '조건 충족', did_not_occur: '조건 미충족', partial: '일부 충족',
  invalid: '무효', unresolvable: '판단 불가', unverifiable: '판정 근거 부족'});
export const STATUS_LABELS = Object.freeze({RIGHTS_RESTRICTED: '권리 제한', AWAITING_OUTCOME: '결과 대기', EXPIRED_UNRESOLVED: '기한 경과 · 미확정',
  RESOLVED: '결과 기록됨', UNVERIFIABLE: '검증 불가', INVALID: '무효', PUBLISHED: '공개됨', ANALYZED: '계산 완료',
  NO_CLOSED_BARS: '확정 봉 없음', OPERATOR_HYPOTHESIS: '운영자 가설', OBSERVATIONS_ONLY: '관측값만', PUBLIC_SOURCE: '공개 출처',
  INSUFFICIENT_DATA: '비교할 결과 부족', OBSERVED_GAIN: '개선 관측', NO_OBSERVED_GAIN: '개선 미관측', FITTED: '학습 반영'});
export const TYPE_LABELS = Object.freeze({prediction: '예측', outcome: '결과 기록', journal: '일기', chart_forecast: '차트 모의 예측',
  analysis: '가격 분석', hypothesis: '가설', macro: '거시 관측', learning: '학습 기록', source: '출처'});
export const RELATION_LABELS = Object.freeze({recorded_outcome: '기록된 결과', cites: '인용한 출처',
  issued_in_window: '발행 시점의 일기', same_symbol: '같은 종목의 분석', promoted_to: '정식 원장으로 승격된 같은 예측'});
export const ROUTE = '/loop.html';

const TOKEN = /[0-9A-Za-z_.\-]+|[가-힣ㄱ-ㆎ一-鿿぀-ヿ]+/g;
const CJK = /[가-힣ㄱ-ㆎ一-鿿぀-ヿ]/;
const RECORD_ID = /\b(P-\d{6}|CH-[0-9a-f]{6,})\b/i;
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g;

// ─────────────────────────────── primitives ────────────────────────────────

export function indexTokens(text) {
  if (typeof text !== 'string') return [];
  const seen = new Set();
  for (const token of text.toLowerCase().match(TOKEN) || []) {
    const pieces = CJK.test(token)
      ? (token.length === 1 ? [token] : Array.from({length: token.length - 1}, (_, i) => token.slice(i, i + 2)))
      : [token.replace(/^[.\-_]+|[.\-_]+$/g, '')];
    for (const piece of pieces) if (piece) seen.add(piece);
  }
  return [...seen];
}

export function parseInstant(value) {
  if (typeof value !== 'string') return NaN;
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!m) return NaN;
  const [,y,mo,d,h,mi,s,z] = m, year = +y, month = +mo;
  const days = [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
  if (!year || month < 1 || month > 12 || +d < 1 || +d > days[month - 1] || +h > 23 || +mi > 59 || +s > 59 ||
      (z !== 'Z' && (+z.slice(1,3) > 23 || +z.slice(4) > 59))) return NaN;
  return Date.parse(value);
}
const ms = parseInstant;
const iso = value => (Number.isFinite(value) ? new Date(value).toISOString().replace(/\.000Z$/, 'Z') : null);
const day = value => (typeof value === 'string' ? value.slice(0, 10) : '미확인');
const pct = value => (typeof value === 'number' && Number.isFinite(value) ? (value * 100).toFixed(1) + '%' : '미설정');
const fmt = new Intl.NumberFormat('en-US', {maximumFractionDigits: 2});
const num = value => (typeof value === 'number' && Number.isFinite(value) ? fmt.format(value) : '미확인');
const normalizeQuestion = q => (typeof q === 'string' ? q.normalize('NFC').replace(CONTROL, '').replace(/\s+/g, ' ').trim() : '');

export function predictionStatus(outcome, expiresAt, asOf) {
  if (RESOLVED_OUTCOMES.has(outcome)) return 'RESOLVED';
  if (outcome === 'unresolvable' || outcome === 'unverifiable') return 'UNVERIFIABLE';
  if (outcome === 'invalid') return 'INVALID';
  if (Number.isFinite(ms(expiresAt)) && ms(expiresAt) < ms(asOf)) return 'EXPIRED_UNRESOLVED';
  return 'AWAITING_OUTCOME';
}

// ─────────────────────────────── intent router ─────────────────────────────

const KEYWORDS = {
  outcome: /결과|맞았|틀렸|적중|결국|resolved|outcome|come true|correct|right|wrong|\bhit\b|\bmiss/,
  superlative: /가장|제일|\bmost\b|biggest|worst|largest/,
  before: /(?:^|\s)전(?:\s|$)|전에|이전|before|prior|앞서/,
  thoughts: /생각|일기|thought|thinking|journal|diary|context/,
  why: /왜|이유|근거|\bwhy\b|rationale|because|reason/,
  hitRate: /적중률|적중 비율|hit rate|accuracy|정확도|맞춘 비율|성공률/,
  miss: /틀린|빗나간|\bmiss|wrong|오차|error|\boff\b/,
  journal: /일기|diary|journal/,
  themes: /테마|주제|반복|theme|recurring|pattern|topic|trend/,
  recent: /최근|recent|latest|newest|\bnew\b/,
  prediction: /예측|prediction|forecast/,
};

function parseDays(lower, fallback) {
  const explicit = lower.match(/(\d{1,3})\s*(?:일|days?|d\b)/);
  if (explicit) return Math.max(1, Math.min(365, Number(explicit[1])));
  if (/지난 ?달|last month|이번 ?달|this month|한 ?달/.test(lower)) return 30;
  if (/지난 ?주|last week|이번 ?주|this week|일주일/.test(lower)) return 7;
  return fallback;
}

function parseLimit(lower, fallback) {
  const explicit = lower.match(/(\d{1,2})\s*(?:건|개|predictions?)/);
  return explicit ? Math.max(1, Math.min(20, Number(explicit[1]))) : fallback;
}

export function classifyIntent(question) {
  const q = normalizeQuestion(question);
  if (!q) return {intent: INTENTS.EMPTY, question: ''};
  const lower = q.toLowerCase();
  const found = lower.match(RECORD_ID);
  const id = found ? found[1].replace(/^p-/i, 'P-').replace(/^ch-/i, 'CH-') : null;
  const has = re => re.test(lower);
  if (id && has(KEYWORDS.before) && has(KEYWORDS.thoughts)) return {intent: INTENTS.THOUGHTS_BEFORE, id, question: q};
  if (id && has(KEYWORDS.outcome) && !has(KEYWORDS.superlative)) return {intent: INTENTS.PREDICTION_OUTCOME, id, question: q};
  if (id && has(KEYWORDS.why)) return {intent: INTENTS.WHY_PREDICTED, id, question: q};
  if (has(KEYWORDS.hitRate)) return {intent: INTENTS.HIT_RATE, days: parseDays(lower, 90), question: q};
  if (has(KEYWORDS.superlative) && has(KEYWORDS.miss)) return {intent: INTENTS.BIGGEST_MISS, limit: parseLimit(lower, 3), question: q};
  if (has(KEYWORDS.journal) && has(KEYWORDS.themes)) return {intent: INTENTS.JOURNAL_THEMES, days: parseDays(lower, 14), question: q};
  if (has(KEYWORDS.recent) && has(KEYWORDS.prediction)) return {intent: INTENTS.RECENT_PREDICTIONS, limit: parseLimit(lower, 5), question: q};
  if (id) return {intent: INTENTS.SHOW_RECORD, id, question: q};
  return {intent: INTENTS.SEARCH, question: q};
}

// ─────────────────────────────── source rights ─────────────────────────────
// Mirror of wie.world_rights: the most restrictive value across the WIE
// owner policy and every source host; UNKNOWN closes that one use. Without a
// registry, every external source is UNKNOWN — the browser fallback fails
// closed rather than open when the page did not embed the registry.

export const RIGHTS_USES = ['internal_storage', 'public_display', 'paid_display', 'derived_output', 'llm_context', 'embeddings', 'export', 'redistribution'];
const RIGHTS_RANK = {DENY: 0, UNKNOWN: 1, ALLOW: 2};
const OWNER_DEFAULT = {internal_storage: 'ALLOW', public_display: 'ALLOW', paid_display: 'ALLOW', derived_output: 'ALLOW',
  llm_context: 'ALLOW', embeddings: 'ALLOW', export: 'DENY', redistribution: 'DENY'};

export function hostOf(url) {
  try { return new URL(url).hostname; } catch { return null; }
}

function rightsIndex(registry) {
  const index = new Map();
  for (const [host, entry] of Object.entries((registry && registry.sources) || {})) {
    index.set(host, entry);
    for (const alias of entry.aliases || []) index.set(alias, entry);
  }
  return index;
}

export function resolveRights(hosts, registry) {
  const index = rightsIndex(registry);
  const unknown = Object.fromEntries(RIGHTS_USES.map(u => [u, (registry && registry.default && registry.default[u]) || 'UNKNOWN']));
  const entries = [index.get('wie') || OWNER_DEFAULT];
  const unregistered = [];
  for (const host of hosts || []) {
    const entry = index.get(host || '');
    if (entry) entries.push(entry); else { entries.push(unknown); unregistered.push(host || '?'); }
  }
  const rights = {};
  for (const use of RIGHTS_USES) {
    rights[use] = entries.map(e => e[use] || 'UNKNOWN').sort((a, b) => RIGHTS_RANK[a] - RIGHTS_RANK[b])[0];
  }
  rights.status = rights.public_display === 'ALLOW' ? 'ALLOWED' : rights.public_display === 'DENY' ? 'DENIED' : 'RESTRICTED';
  rights.sources = (hosts || []).filter(Boolean);
  if (unregistered.length) rights.unregistered = unregistered;
  return rights;
}

export function intersectRights(policies) {
  return Object.fromEntries(RIGHTS_USES.map(use => [use, policies.map(p =>
    Object.hasOwn(RIGHTS_RANK, p?.[use]) ? p[use] : 'UNKNOWN').sort((a, b) => RIGHTS_RANK[a] - RIGHTS_RANK[b])[0] || 'UNKNOWN']));
}

export function resolveSourceRefs(refs, registry, {asOf = null} = {}) {
  const index = rightsIndex(registry), policies = [index.get('wie') || OWNER_DEFAULT];
  const hosts = [], unregistered = [], blocked = [], attributions = [], deadlines = {};
  for (const ref of refs || []) {
    const host = hostOf(ref.url); hosts.push(host);
    let policy = {...(index.get(host) || registry?.default || {})};
    if (!index.has(host)) unregistered.push(host || '?');
    if (policy.datasets !== undefined) {
      let path;
      try { path = new URL(decodeURIComponent(new URL(ref.url).pathname), 'https://path.invalid').pathname; } catch { path = ''; }
      const matches = Object.entries(policy.datasets).filter(([key, item]) => (!ref.dataset_id || ref.dataset_id === key)
        && (!item.hosts || item.hosts.includes(host))
        && (item.path_prefixes || []).some(prefix => { const base = prefix.replace(/\/$/, ''); return path === base || path.startsWith(base + '/'); }));
      if (matches.length !== 1) {
        policy = Object.fromEntries(RIGHTS_USES.map(u => [u, 'UNKNOWN']));
        blocked.push({source: host, condition: 'DATASET_SCOPE', use: 'all'});
      } else {
        policy = {...policy, ...matches[0][1]};
        for (const use of RIGHTS_USES) if (index.get(host)[use] === 'DENY') policy[use] = 'DENY';
      }
    }
    for (const [use, conditions] of Object.entries(policy.use_conditions || {})) {
      if (!RIGHTS_USES.includes(use) || !conditions || typeof conditions !== 'object') continue;
      for (const [condition, expected] of Object.entries(conditions)) {
        let failure = null;
        if (condition === 'attribution') {
          if (typeof expected !== 'string' || ref.attribution !== expected) failure = 'UNKNOWN';
          else attributions.push(expected);
        } else if (condition === 'retention_seconds') {
          const start = ms(ref.observed_at), end = ms(asOf);
          if (!Number.isFinite(start) || !Number.isFinite(end) || end < start || typeof expected !== 'number'
              || !Number.isFinite(expected) || expected < 0) failure = 'UNKNOWN';
          else {
            const deadline = start + expected * 1000;
            deadlines[use] = Math.min(deadlines[use] ?? deadline, deadline);
            if (end > deadline) failure = 'DENY';
          }
        } else failure = 'UNKNOWN';
        if (failure) {
          policy[use] = intersectRights([policy, {...OWNER_DEFAULT, [use]: failure}])[use];
          blocked.push({source: host, condition, use});
        }
      }
    }
    if (ref.rights && typeof ref.rights === 'object') policy = intersectRights([policy,
      Object.fromEntries(RIGHTS_USES.map(use => [use, Object.hasOwn(ref.rights, use) ? ref.rights[use] : 'ALLOW']))]);
    policies.push(policy);
  }
  const result = intersectRights(policies);
  Object.assign(result, {status: result.public_display === 'ALLOW' ? 'ALLOWED' : result.public_display === 'DENY' ? 'DENIED' : 'RESTRICTED',
    sources: hosts.filter(Boolean)});
  if (unregistered.length) result.unregistered = unregistered;
  if (blocked.length) result.blocked_conditions = blocked;
  if (attributions.length) result.attributions = [...new Set(attributions)].sort();
  if (Object.keys(deadlines).length) result.expires_at_ms = deadlines;
  return result;
}

export function stubRecord(record) {
  const sources = ((record.rights || {}).sources || []).join(', ') || '출처 미상';
  const notice = '원천 자료(' + sources + ')의 공개 표시 권리가 확인되지 않아 내용을 표시하지 않습니다. 기록 자체는 존재하며 부정 판단이 아닙니다.';
  const keep = {};
  for (const k of ['id', 'type', 'record_id', 'created_at', 'as_of', 'valid_until', 'observed_at', 'published_at',
    'visibility', 'locator', 'integrity', 'links', 'symbol', 'timeframe', 'available_at', 'entity_id']) if (k in record) keep[k] = record[k];
  keep.title = record.record_id || record.id || '기록'; keep.status = 'RIGHTS_RESTRICTED';
  keep.summary = notice; keep.content = notice;
  keep.probability = null; keep.outcome = null;
  keep.confidence = null;
  keep.source_refs = (record.source_refs || []).filter(s => s && s.url).map(s => ({url: s.url, kind: s.kind}));
  keep.rights = {...(record.rights || {})};
  // Discoverable by its WIE-composed title and id, never by restricted content.
  keep.tokens = indexTokens([record.symbol, record.timeframe, record.record_id || record.id].filter(Boolean).join(' '));
  keep.restricted = true;
  return keep;
}

// What a principal may see: full records where the relevant display use is
// ALLOW, shells otherwise. `paid` selects the paid_display policy.
export function policyAllows(rights, use, now = Date.now()) {
  if (rights?.[use] !== 'ALLOW') return false;
  const expiry = rights.expires_at_ms?.[use];
  return expiry === undefined || (typeof expiry === 'number' && Number.isFinite(expiry) && now <= expiry);
}

export function presentRecords(records, {paid = false, now = Date.now()} = {}) {
  const use = paid ? 'paid_display' : 'public_display';
  // A DENY record never reaches a store; if one did, no plan may show it.
  return (records || []).filter(r => (r.rights || {}).public_display !== 'DENY')
    .map(r => (policyAllows(r.rights, use, now) ? r : stubRecord(r)));
}

export const llmEligible = (record, {now = Date.now()} = {}) => !!record && !record.restricted && policyAllows(record.rights, 'llm_context', now);

// ─────────────────────────────── snapshot adapter ──────────────────────────
// A browser-side mirror of wie.world_projection for the deterministic
// fallback. Ids, statuses, links and times follow the Python contract; the
// prose is shorter. Structural parity is asserted by tests on both sides.

function record(ctx, fields) {
  const r = {probability: null, confidence: null, outcome: null, created_at: null, valid_until: null,
    observed_at: null, source_refs: [], links: [], ...fields,
    published_at: ctx.publishedAt, visibility: 'PUBLIC'};
  r.created_at = r.created_at || r.as_of;
  r.integrity = {snapshot_sha256: ctx.snapshotHash || null};
  r.entity_id = entityForRecord(r);
  const registry = rightsIndex(ctx.rights);
  r.source_refs = r.source_refs.map(ref => {
    const credit = registry.get(hostOf(ref.url))?.attribution_text;
    return credit ? {...ref, attribution: credit} : ref;
  });
  r.locator = {route: ROUTE, focus: r.id, href: fields.href || (ROUTE + '#focus=' + r.id)};
  r.tokens = indexTokens([r.title, r.summary, r.content, r.record_id].filter(Boolean).join(' '));
  r.rights = resolveSourceRefs(r.source_refs, ctx.rights, {asOf: ctx.asOf});
  r.available_at = [r.as_of, ...r.source_refs.map(s => s.observed_at).filter(Boolean)].sort((a, b) => ms(b) - ms(a))[0];
  // DENY closes the record for the public entirely (mirrors the Python projection).
  ctx.records.push(r);
  return r;
}

function sourceRef(source) {
  if (!source || typeof source.url !== 'string' || !/^https:\/\//.test(source.url)) return null;
  const ref = {url: source.url, kind: source.kind || 'official_public', observed_at: source.observed_at || null,
    sha256: source.sha256 || null};
  for (const key of ['provider', 'provider_symbol', 'currency', 'exchange', 'timezone', 'session', 'adjustment', 'data_as_of', 'data_date', 'publication_date', 'dataset_id', 'attribution']) if (source[key]) ref[key] = String(source[key]);
  if (source.rights && typeof source.rights === 'object') ref.rights = Object.fromEntries(RIGHTS_USES.filter(u => Object.hasOwn(source.rights, u)).map(u => [u, source.rights[u]]));
  return ref;
}

function sourceRefs(...values) {
  const refs = values.flat().map(sourceRef).filter(Boolean), unique = new Map();
  for (const ref of refs) unique.set(JSON.stringify(ref), ref);
  return [...unique.values()];
}

export function inheritLineage(records, {rights = null, asOf = null} = {}) {
  const rows = records.map(r => ({...r, source_refs: sourceRefs(r.source_refs || [])}));
  const byId = new Map(rows.map(r => [r.id, r])), visited = new Map(), visiting = new Set();
  function visit(row) {
    if (visiting.has(row.id)) return false;
    if (visited.has(row.id)) return visited.get(row.id);
    visiting.add(row.id);
    const parents = []; let complete = true;
    for (const id of row.derived_from || []) {
      const parent = byId.get(id);
      if (!parent || !visit(parent)) complete = false;
      if (parent) parents.push(parent);
    }
    row.source_refs = sourceRefs(row.source_refs, ...parents.map(p => p.source_refs));
    const resolved = resolveSourceRefs(row.source_refs, rights, {asOf});
    Object.assign(resolved, intersectRights([resolved, ...parents.map(p => p.rights || {}), ...(!complete ? [{}] : [])]));
    if (row.derived_from?.length || ['prediction', 'chart_forecast', 'analysis', 'hypothesis', 'outcome', 'macro'].includes(row.type)) for (const use of ['public_display', 'paid_display', 'llm_context', 'embeddings', 'export', 'redistribution']) {
      resolved[use] = [resolved[use], resolved.derived_output].sort((a, b) => RIGHTS_RANK[a] - RIGHTS_RANK[b])[0];
      const limit = resolved.expires_at_ms?.derived_output;
      if (Number.isFinite(limit)) resolved.expires_at_ms[use] = Math.min(resolved.expires_at_ms[use] ?? limit, limit);
    }
    resolved.status = resolved.public_display === 'ALLOW' ? 'ALLOWED' : resolved.public_display === 'DENY' ? 'DENIED' : 'RESTRICTED';
    row.rights = resolved;
    row.lineage_status = !complete ? 'INCOMPLETE' : row.source_refs.length ? 'SOURCE_BOUND' : 'OWNER_RECORD';
    row.available_at = [row.available_at || row.as_of, ...parents.map(p => p.available_at || p.as_of)].sort((a, b) => ms(b) - ms(a))[0];
    visiting.delete(row.id); visited.set(row.id, complete); return complete;
  }
  rows.forEach(visit);
  return rows.filter(r => r.rights.public_display !== 'DENY');
}

function journalLinks(ctx, issuedAt) {
  const t = ms(issuedAt);
  if (!Number.isFinite(t)) return [];
  return ctx.windows.filter(w => w.start <= t && t < w.end).map(w => ({to: 'diary-' + w.day, relation: 'issued_in_window'}));
}

function forecastRecords(ctx, raw, card, prefix, analyses) {
  const pid = raw.id;
  const outcome = ['occurred', 'did_not_occur', 'partial', 'unresolvable', 'unverifiable', 'invalid'].includes(raw.outcome) ? raw.outcome : null;
  const issuedAt = card.issued_at || raw.issued_at || null, expiresAt = card.expires_at || raw.expires_at || null;
  const status = predictionStatus(outcome, expiresAt, ctx.asOf);
  const sources = sourceRefs(card.source, raw.source, card.source_refs, raw.source_refs), source = sources[0] || null;
  const title = card.title || raw.title;
  const probability = Object.hasOwn(card, 'probability') ? card.probability : raw.probability;
  const parts = [];
  if (card.rationale) parts.push('살피는 이유: ' + card.rationale);
  if (card.method) parts.push('판단 방법: ' + card.method);
  parts.push('등록 확률: ' + pct(probability));
  if (raw.sealed === false) parts.push('앵커 상태: 봉인되지 않은 예측이라 채점할 수 없습니다.');
  const links = [];
  const id = prefix + pid;
  if (outcome) links.push({to: 'outcome-' + pid, relation: 'recorded_outcome'});
  if (source) links.push({to: 'source-' + pid, relation: 'cites'});
  links.push(...journalLinks(ctx, issuedAt));
  const symbol = source && source.provider_symbol ? source.provider_symbol : null;
  if (symbol && analyses.has(symbol) && prefix !== 'prediction-') links.push({to: analyses.get(symbol), relation: 'same_symbol'});
  record(ctx, {id, type: prefix === 'prediction-' ? 'prediction' : 'chart_forecast', record_id: pid, title,
    summary: card.statement || title, content: parts.join(' '), status, as_of: issuedAt || ctx.asOf, created_at: issuedAt,
    valid_until: expiresAt, probability: typeof probability === 'number' ? probability : null, outcome,
    source_refs: sources, links, href: card.href || raw.href, category: card.category || raw.category || null,
    sealed: raw.sealed !== false, symbol, promoted_from: card.forecast_id || null, outcome_observed_at: outcome ? raw.resolved_at || null : null});
  if (source) record(ctx, {id: 'source-' + pid, type: 'source', record_id: pid, title: title + ' 출처',
    summary: '이 예측이 인용한 공개 출처입니다.', content: source.url, status: 'PUBLIC_SOURCE',
    as_of: source.observed_at || issuedAt || ctx.asOf, source_refs: [source], href: card.href || raw.href});
  if (outcome) {
    const resolvedAt = raw.resolved_at || ctx.asOf, closed = RESOLVED_OUTCOMES.has(outcome);
    record(ctx, {id: 'outcome-' + pid, type: 'outcome', record_id: pid, title: title + ' · 결과 기록',
      summary: '결과: ' + (OUTCOME_LABELS[outcome] || outcome) + ' · 결과 기록 시각 ' + resolvedAt,
      content: '등록 확률 ' + pct(probability) + '의 예측이 ' + (OUTCOME_LABELS[outcome] || outcome) + ' 로 기록됐습니다. '
        + (closed ? '조건대로 결과까지 확인한 기록입니다.' : '결과를 판정할 수 없어 적중이나 실패로 세지 않습니다.'),
      status, as_of: resolvedAt, observed_at: resolvedAt, confidence: closed ? 'high' : 'low', outcome,
      source_refs: sourceRefs(sources, raw.outcome_source, raw.outcome_source_refs), derived_from: [id],
      links: [{to: id, relation: 'recorded_outcome'}], href: card.href || raw.href});
  }
}

export function recordsFromSnapshot(snapshot, {rights = null} = {}) {
  if (!snapshot || snapshot.schema !== 'wie.public-live/1' || !snapshot.integrity || snapshot.integrity.status !== 'VERIFIED'
      || !snapshot.observed_at) return [];
  const ctx = {records: [], asOf: snapshot.observed_at, publishedAt: snapshot.generated_at, rights, snapshotHash: snapshot.integrity.snapshot_sha256,
    windows: (snapshot.diary || []).filter(d => d.window_start && d.window_end)
      .map(d => ({day: d.day, start: ms(d.window_start), end: ms(d.window_end)}))};
  const analyses = new Map();
  const chart = snapshot.chart || {};
  for (const row of chart.analyses || []) {
    const rid = row.symbol + '-' + row.timeframe, source = sourceRef(row.source);
    const zones = items => (items || []).map(z => num(typeof z === 'object' ? z.price : z)).join(', ') || '없음';
    if (row.status === 'NO_CLOSED_BARS') {
      record(ctx, {id: 'analysis-' + rid, type: 'analysis', record_id: rid, title: row.symbol + ' · ' + row.timeframe,
        summary: '확정된 가격 봉이 없어 계산하지 않았습니다.', content: '확정된 가격 봉이 없어 계산하지 않았습니다.',
        status: 'NO_CLOSED_BARS', as_of: row.as_of || ctx.asOf, source_refs: source ? [source] : [],
        href: '/record/#chart-' + rid, symbol: row.symbol, timeframe: row.timeframe});
      continue;
    }
    const content = ['기준 가격 ' + num(row.price) + ' · 자료 시각 ' + (row.data_as_of || row.as_of) + '.',
      '계산된 지지 가격 ' + zones(row.support) + ' · 저항 가격 ' + zones(row.resistance) + '.',
      '과거 가격에서 고저점과 채널을 계산한 값입니다. 미래의 적중률이나 인과관계를 입증하지 않습니다.'];
    record(ctx, {id: 'analysis-' + rid, type: 'analysis', record_id: rid, title: row.symbol + ' · ' + row.timeframe,
      summary: content[0], content: content.join(' '), status: row.status || 'ANALYZED', as_of: row.as_of || ctx.asOf,
      observed_at: row.data_as_of || null, source_refs: source ? [source] : [], href: '/record/#chart-' + rid,
      symbol: row.symbol, timeframe: row.timeframe, price: typeof row.price === 'number' ? row.price : null});
    if (source && source.provider_symbol && !analyses.has(source.provider_symbol)) analyses.set(source.provider_symbol, 'analysis-' + rid);
    if (!analyses.has(row.symbol)) analyses.set(row.symbol, 'analysis-' + rid);
  }
  const official = new Map([...(snapshot.topics || []), ...(snapshot.canonical_chart || [])].map(c => [c.id, c]));
  for (const raw of snapshot.predictions || []) forecastRecords(ctx, raw, official.get(raw.id) || raw, 'prediction-', analyses);
  for (const raw of chart.forecasts || []) forecastRecords(ctx, raw, raw, 'chart-', analyses);
  for (const d of snapshot.diary || []) {
    const summary = '이날 관측한 자료 ' + num(d.mentions_observed) + '건, 판단 후보 ' + num(d.candidates) + '건, 새 예측 '
      + num(d.new_predictions) + '건, 결과 기록 ' + num(d.resolved) + '건입니다.';
    const r = record(ctx, {id: 'diary-' + d.day, type: 'journal', record_id: d.day, title: d.day + ' 일기', summary,
      content: summary + ' 조건대로 결과까지 확인한 기록 ' + num(d.closed_loops) + '건 · 자료 오류 ' + num(d.source_errors)
        + '건. 후보는 사건 확정이 아니며, 자료가 늘었다는 사실만으로 학습이나 예측력 향상을 주장하지 않습니다.',
      status: 'PUBLISHED', as_of: d.window_end || d.generated_at, created_at: d.generated_at || null, href: d.href,
      day: d.day, window_start: d.window_start || null, window_end: d.window_end || null,
      counts: {mentions_observed: d.mentions_observed, candidates: d.candidates, new_predictions: d.new_predictions,
        resolved: d.resolved, closed_loops: d.closed_loops, source_errors: d.source_errors}});
    r.integrity = {diary_sha256: d.sha256 || null, markdown_sha256: d.markdown_sha256 || null};
  }
  for (const h of chart.hypotheses || []) {
    if (h.origin !== 'OPERATOR_HYPOTHESIS' || h.probability !== null) continue;
    const source = sourceRef(h.source), key = (source && source.provider_symbol) || h.symbol;
    const content = ['검토 조건 ' + conditionText(h.target) + ' · 모형 결과 ' + ((h.timing || {}).status || 'INSUFFICIENT_DATA') + '.',
      '운영자가 제시한 목표 가격 가설이며 실제 도달 확률은 산출하지 않았습니다.',
      ...(h.counterevidence || []).map(c => '반대 근거: ' + c),
      ...(h.invalidation_points || []).map(c => '가설을 다시 살필 조건: ' + conditionText(c))];
    record(ctx, {id: 'hypothesis-' + h.id, type: 'hypothesis', record_id: h.id, title: h.symbol + ' 목표 가격 가설',
      summary: content[0], content: content.join(' '), status: 'OPERATOR_HYPOTHESIS', as_of: h.observed_at || ctx.asOf,
      source_refs: source ? [source] : [], links: analyses.has(key) ? [{to: analyses.get(key), relation: 'same_symbol'}] : [],
      href: '/record/#hypothesis-' + h.id, symbol: h.symbol, probability: null});
  }
  const context = snapshot.market_context || {};
  for (const row of context.series || []) {
    const content = row.label + ' ' + num(row.value) + ' ' + (row.units || '') + ' · 지표 관측일 ' + (row.data_date || '미확인')
      + ' · 자료 상태 ' + (row.status || 'FRESH') + '. 관측값만 표시하며 이 자료로 급락 확률이나 목표 가격을 계산하지 않습니다.';
    record(ctx, {id: 'macro-' + row.id, type: 'macro', record_id: row.id, title: row.label, summary: content.split(' · ')[0],
      content, status: 'OBSERVATIONS_ONLY', as_of: context.observed_at || ctx.asOf, observed_at: context.observed_at || null,
      source_refs: row.source_url ? [{url: row.source_url, kind: 'official_public', sha256: row.raw_sha256 || null, observed_at: null}] : [],
      href: '/record/#macro-' + row.id, probability: null, value: row.value, units: row.units || null, data_date: row.data_date || null});
  }
  if (snapshot.learning) {
    const l = snapshot.learning, e = l.evaluation || {}, status = e.status || 'INSUFFICIENT_DATA';
    const content = '학습에 반영한 확정 결과 ' + num(l.training_count) + '건 · 비교용 보조 예측 ' + num(l.shadow_forecast_count)
      + '건 · 미래 결과와 비교한 표본 ' + num(e.paired_count) + '건 · 비교 결과 ' + status
      + '. 보조 예측을 저장한 횟수는 정확도 향상이 아닙니다.';
    record(ctx, {id: 'learning', type: 'learning', record_id: 'learning', title: '확정 결과로 학습한 기록',
      summary: content.split(' · 비교 결과')[0] + '.', content, status, as_of: l.as_of || ctx.asOf,
      href: '/wie/status/#learning-section', probability: null, mode: l.mode || null});
  }
  // Identity comes only from the verified canonical bridge's forecast id.
  const canonical = new Map();
  for (const r of ctx.records) if (r.type === 'prediction' && r.promoted_from) {
    if (canonical.has(r.promoted_from)) return [];
    canonical.set(r.promoted_from, r.id);
  }
  for (const r of ctx.records) if (r.type === 'chart_forecast') {
    const twin = canonical.get(r.record_id);
    if (twin) { r.links.push({to: twin, relation: 'promoted_to'}); r.superseded_by = twin; }
  }
  return inheritLineage(ctx.records, {rights, asOf: ctx.asOf}).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const isSuperseded = r => !!(r && r.superseded_by);

function conditionText(c) {
  if (!c || typeof c !== 'object') return '미확인';
  const field = {close: '종가', low: '저가', high: '고가'}[c.field] || c.field;
  const op = {gt: '>', lt: '<', gte: '≥', lte: '≤', '>': '>', '<': '<', '>=': '≥', '<=': '≤', '==': '=', above: '>', below: '<'}[c.operator] || c.operator;
  return field + ' ' + op + ' ' + num(c.value);
}

// ─────────────────────────────── time boundary ─────────────────────────────

export function visibleAsOf(records, asOf) {
  const limit = ms(asOf);
  if (!Number.isFinite(limit)) return [];
  const rows = records.filter(r => {
    const t = ms(r.available_at || r.as_of);
    return Number.isFinite(t) && t <= limit && (r.type !== 'outcome' || (Number.isFinite(ms(r.observed_at)) && ms(r.observed_at) <= limit));
  }).map(r => ({...r, links: (r.links || []).map(l => ({...l}))}));
  const byId = new Map(rows.map(r => [r.id, r]));
  return rows.map(r => {
    if (r.superseded_by && !byId.has(r.superseded_by)) {
      delete r.superseded_by;
      r.links = r.links.filter(l => l.relation !== 'promoted_to');
    }
    if (r.type !== 'prediction' && r.type !== 'chart_forecast') return r;
    const link = r.links.find(l => l.relation === 'recorded_outcome' && byId.get(l.to)?.type === 'outcome');
    const outcome = link ? byId.get(link.to) : null;
    r.outcome = outcome?.outcome || null;
    r.status = r.restricted ? 'RIGHTS_RESTRICTED' : predictionStatus(r.outcome, r.valid_until, asOf);
    if (!outcome) { r.links = r.links.filter(l => l.relation !== 'recorded_outcome'); r.outcome_observed_at = null; }
    return r;
  });
}

export function effectiveStatus(rec, asOf, byId) {
  if (!rec) return 'UNKNOWN';
  if (rec.restricted) return 'RIGHTS_RESTRICTED';
  if (rec.type !== 'prediction' && rec.type !== 'chart_forecast') return rec.status;
  const link = (rec.links || []).find(l => l.relation === 'recorded_outcome');
  const outcome = link && byId ? byId.get(link.to) : null;
  if (outcome && Number.isFinite(ms(outcome.observed_at)) && ms(outcome.observed_at) <= ms(asOf)) {
    return predictionStatus(outcome.outcome, rec.valid_until, asOf);
  }
  return predictionStatus(null, rec.valid_until, asOf);
}

// ─────────────────────────────── composition ───────────────────────────────

// Evidence metadata is stated at the query boundary: a prediction whose
// outcome lies after `asOf` reads as awaiting, exactly as the answer does.
const evidenceOf = (r, asOf, byId) => ({id: r.id, type: r.type, title: r.title, locator: r.locator,
  status: effectiveStatus(r, asOf, byId), as_of: r.as_of, rights: (r.rights || {}).status || 'RESTRICTED', restricted: !!r.restricted,
  attributions: r.restricted ? [] : (r.rights?.attributions || [])});
const SEARCH_TYPE_RANK = {prediction: 0, outcome: 1, journal: 2, chart_forecast: 3, analysis: 4, hypothesis: 5, macro: 6, learning: 7, source: 8};
const noEvidence = (intent, asOf) => ({answer: NO_EVIDENCE_ANSWER, evidence: [], confidence: 'unknown', as_of: asOf,
  retrieval_count: 0, status: 'NO_EVIDENCE', intent});

function finish(result, projection) {
  if (projection && projection.status === 'STALE' && result.status === 'OK') {
    result.status = 'PROJECTION_STALE';
    result.confidence = 'low';
    result.answer += ' (공개 projection이 오래되어 최신 상태를 보장하지 않습니다.)';
  }
  return result;
}

function findForecast(byId, id) {
  return byId.get('prediction-' + id) || byId.get('chart-' + id) || null;
}

function linkedOutcome(rec, byId, asOf) {
  const link = (rec.links || []).find(l => l.relation === 'recorded_outcome');
  const o = link ? byId.get(link.to) : null;
  return o && Number.isFinite(ms(o.observed_at)) && ms(o.observed_at) <= ms(asOf) ? o : null;
}

export function compose({intent, params = {}, records = [], hits, asOf, projection = {status: 'VERIFIED'}}) {
  const visible = visibleAsOf(records, asOf);
  const byId = new Map(visible.map(r => [r.id, r]));
  const label = r => STATUS_LABELS[effectiveStatus(r, asOf, byId)] || effectiveStatus(r, asOf, byId);
  const ok = (answer, evidence, confidence, extra = {}) => finish({answer, evidence: evidence.map(r => evidenceOf(r, asOf, byId)), confidence,
    as_of: asOf, retrieval_count: evidence.length, status: 'OK', intent, ...extra}, projection);

  switch (intent) {
    case INTENTS.RECENT_PREDICTIONS: {
      const limit = params.limit || 5;
      const preds = visible.filter(r => r.type === 'prediction' && !isSuperseded(r)).sort((a, b) => ms(b.created_at) - ms(a.created_at)).slice(0, limit);
      if (!preds.length) return noEvidence(intent, asOf);
      const lines = preds.map((p, i) => `${i + 1}. [E${i + 1}] ${p.title} (${p.record_id}) — 등록 확률 ${pct(p.probability)} · 기한 ${day(p.valid_until)} · ${label(p)}`);
      return ok(`기준 시각 ${asOf} 기준 최근 예측 ${preds.length}건입니다.\n` + lines.join('\n'), preds, 'high');
    }
    case INTENTS.PREDICTION_OUTCOME: {
      const p = findForecast(byId, params.id);
      if (!p) return noEvidence(intent, asOf);
      const o = linkedOutcome(p, byId, asOf);
      if (o) {
        const closed = RESOLVED_OUTCOMES.has(o.outcome);
        return ok(`${p.record_id} (${p.title})은(는) ${o.observed_at}에 '${OUTCOME_LABELS[o.outcome] || o.outcome}'(으)로 기록됐습니다 [E2]. `
          + `등록 확률 ${pct(p.probability)} [E1]. ${closed ? '조건대로 결과까지 확인한 기록입니다.' : '판정 근거가 부족해 적중이나 실패로 세지 않습니다.'}`,
          [p, o], 'high');
      }
      return ok(`${p.record_id} (${p.title})의 결과는 아직 기록되지 않았습니다 [E1]. 기한 ${day(p.valid_until)} · 상태 ${label(p)}. 미확정은 실패가 아닙니다.`,
        [p], 'high');
    }
    case INTENTS.HIT_RATE: {
      const days = params.days || 90, to = ms(asOf), from = to - days * 86400000;
      const outcomes = visible.filter(r => r.type === 'outcome' && ms(r.observed_at) >= from && ms(r.observed_at) <= to);
      let hits = 0, partial = 0, excluded = 0, sq = 0;
      const resolved = [];
      for (const o of outcomes) {
        const p = findForecast(byId, o.record_id);
        // No registered probability means no direction to score: excluded, never a hit or a miss.
        if (!p || !RESOLVED_OUTCOMES.has(o.outcome) || isSuperseded(p) || typeof p.probability !== 'number' || !Number.isFinite(p.probability)) { excluded += 1; continue; }
        resolved.push(o);
        const y = o.outcome === 'occurred' ? 1 : o.outcome === 'did_not_occur' ? 0 : 0.5;
        sq += (p.probability - y) ** 2;
        if (o.outcome === 'partial') partial += 1;
        else if ((o.outcome === 'occurred' && p.probability >= 0.5) || (o.outcome === 'did_not_occur' && p.probability < 0.5)) hits += 1;
      }
      if (!resolved.length) return noEvidence(intent, asOf);
      const directional = resolved.length - partial;
      const rate = directional ? (hits / directional * 100).toFixed(1) + '%' : '해당 없음';
      const answer = `최근 ${days}일(${day(iso(from))}~${day(asOf)}) 동안 결과가 기록된 예측 ${resolved.length}건 중 등록 확률의 방향이 맞은 것은 ${hits}건입니다 (${rate}). `
        + `일부 충족 ${partial}건은 방향 판정에서 제외했고, 판단 불가·무효·확률 미등록 ${excluded}건은 세지 않았습니다. 평균 제곱 오차 ${(sq / resolved.length).toFixed(3)}. `
        + '채점 계약: 등록 확률 0.5 기준 방향 일치 · 분모는 결과가 기록된 예측 · 미해결은 세지 않음. 표본이 작아 예측력의 증거로 읽지 않습니다.';
      return ok(answer, resolved, 'high', {stats: {days, resolved: resolved.length, hits, partial, excluded, mean_squared_error: sq / resolved.length}});
    }
    case INTENTS.BIGGEST_MISS: {
      const ranked = visible.filter(r => r.type === 'outcome' && RESOLVED_OUTCOMES.has(r.outcome)).map(o => {
        const p = findForecast(byId, o.record_id);
        const y = o.outcome === 'occurred' ? 1 : o.outcome === 'did_not_occur' ? 0 : 0.5;
        return p && !isSuperseded(p) && typeof p.probability === 'number' ? {o, p, error: Math.abs(p.probability - y)} : null;
      }).filter(Boolean).sort((a, b) => b.error - a.error).slice(0, params.limit || 3);
      if (!ranked.length) return noEvidence(intent, asOf);
      const lines = ranked.map((x, i) => `${i + 1}. [E${i + 1}] ${x.p.title} (${x.p.record_id}) — 등록 확률 ${x.p.probability} · 결과 ${OUTCOME_LABELS[x.o.outcome]} · 오차 ${x.error.toFixed(2)}`);
      return ok('결과가 기록된 예측 중 등록 확률과 결과의 차이가 큰 순서입니다. 판단 불가·무효는 제외했습니다.\n' + lines.join('\n'),
        [...ranked.map(x => x.o), ...ranked.map(x => x.p)], 'high');
    }
    case INTENTS.WHY_PREDICTED: {
      const p = findForecast(byId, params.id);
      if (!p) return noEvidence(intent, asOf);
      const sources = (p.links || []).filter(l => l.relation === 'cites').map(l => byId.get(l.to)).filter(Boolean);
      const journals = (p.links || []).filter(l => l.relation === 'issued_in_window').map(l => byId.get(l.to)).filter(Boolean);
      const parts = [`${p.record_id} (${p.title}) [E1] — ${p.content}`];
      sources.forEach((s, i) => parts.push(`출처 [E${i + 2}]: ${s.content}${s.source_refs[0] && s.source_refs[0].observed_at ? ' (관측 ' + s.source_refs[0].observed_at + ')' : ''}`));
      journals.forEach((j, i) => parts.push(`발행 당시의 일기 [E${sources.length + i + 2}]: ${j.title} — ${j.summary}`));
      return ok(parts.join(' '), [p, ...sources, ...journals], 'high', {synthesis: true});
    }
    case INTENTS.SHOW_RECORD: {
      const r = findForecast(byId, params.id) || byId.get(params.id) || visible.find(x => x.record_id === params.id) || null;
      if (!r) return noEvidence(intent, asOf);
      return ok(`${r.title} (${r.record_id}) [E1] · ${TYPE_LABELS[r.type] || r.type} · 상태 ${label(r)} · ${r.summary} 우주 화면에서 보기: ${r.locator.route}#focus=${r.locator.focus}`,
        [r], 'high');
    }
    case INTENTS.THOUGHTS_BEFORE: {
      const p = findForecast(byId, params.id);
      if (!p) return noEvidence(intent, asOf);
      const t = ms(p.created_at);
      const journals = visible.filter(r => r.type === 'journal' && ms(r.as_of) <= t).sort((a, b) => ms(b.as_of) - ms(a.as_of)).slice(0, 3);
      const related = visible.filter(r => (r.type === 'analysis' || r.type === 'hypothesis') && ms(r.as_of) <= t && (!p.symbol || r.symbol === p.symbol))
        .sort((a, b) => ms(b.as_of) - ms(a.as_of)).slice(0, 3);
      if (!journals.length && !related.length) return noEvidence(intent, asOf);
      const parts = [`${p.record_id} (${p.title}) [E1]는 ${p.created_at}에 발행됐습니다. 그 이전의 기록입니다.`];
      [...journals, ...related].forEach((r, i) => parts.push(`[E${i + 2}] ${r.title} (${day(r.as_of)}): ${r.summary}`));
      parts.push('선후 관계는 시간 순서일 뿐이며 인과를 입증하지 않습니다.');
      return ok(parts.join(' '), [p, ...journals, ...related], 'medium', {synthesis: true});
    }
    case INTENTS.JOURNAL_THEMES: {
      const days = params.days || 14, to = ms(asOf), from = to - days * 86400000;
      const journals = visible.filter(r => r.type === 'journal' && ms(r.as_of) >= from).sort((a, b) => ms(b.as_of) - ms(a.as_of));
      if (!journals.length) return noEvidence(intent, asOf);
      const sum = key => journals.reduce((n, j) => n + ((j.counts || {})[key] || 0), 0);
      const windows = new Set(journals.map(j => j.id));
      const titles = new Map();
      for (const p of visible.filter(r => r.type === 'prediction')) {
        if ((p.links || []).some(l => l.relation === 'issued_in_window' && windows.has(l.to))) titles.set(p.category || p.title, (titles.get(p.category || p.title) || 0) + 1);
      }
      const top = [...titles.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k} ${v}건`);
      const answer = `최근 ${days}일 일기 ${journals.length}건입니다 [E1${journals.length > 1 ? '–E' + journals.length : ''}]. 관측 자료 합계 ${num(sum('mentions_observed'))}건, 판단 후보 ${num(sum('candidates'))}건, `
        + `새 예측 ${num(sum('new_predictions'))}건, 결과 기록 ${num(sum('resolved'))}건, 자료 오류 ${num(sum('source_errors'))}건. `
        + (top.length ? `이 기간에 발행된 예측 주제: ${top.join(', ')}. ` : '이 기간에 발행된 예측은 없습니다. ')
        + '일기 원문은 공개하지 않으며 공개 요약의 집계만 말합니다.';
      return ok(answer, journals, 'medium', {synthesis: true});
    }
    case INTENTS.SEARCH: {
      let found = hits;
      if (!Array.isArray(found)) {
        const want = new Set(indexTokens(params.question || ''));
        found = visible.map(r => ({r, score: (r.tokens || []).filter(t => want.has(t)).length})).filter(x => x.score > 0)
          .sort((a, b) => b.score - a.score || (a.r.id < b.r.id ? -1 : 1)).slice(0, 5).map(x => x.r);
      }
      // A source row only restates a URL; the record that cites it is the
      // evidence a reader wants first. Stable: text rank is kept within a type.
      found = found.filter(r => byId.has(r.id)).map((r, i) => ({r, i}))
        .sort((a, b) => (SEARCH_TYPE_RANK[a.r.type] ?? 9) - (SEARCH_TYPE_RANK[b.r.type] ?? 9) || a.i - b.i).map(x => x.r);
      if (!found.length) return noEvidence(intent, asOf);
      const lines = found.map((r, i) => `${i + 1}. [E${i + 1}] ${r.title} (${TYPE_LABELS[r.type] || r.type} · ${label(r)}) — ${r.summary}`);
      return ok(`'${params.question || ''}'에 대해 공개 기록 ${found.length}건을 찾았습니다.\n` + lines.join('\n'), found, found.length >= 3 ? 'medium' : 'low');
    }
    default:
      return noEvidence(intent, asOf);
  }
}

// ─────────────────────────────── coverage ──────────────────────────────────
// The product vocabulary for "does WIE judge this target?" (PRODUCT.md §5):
//   ACTIVE            a live forecast with evidence, and an audited history
//   WATCH             observations exist; no live forecast (or only history)
//   AWAITING_OUTCOME  a forecast is live but unresolved
//   UNVERIFIABLE      forecasts exist but none could be resolved
//   NOT_COVERED       no public record for the target at all
// None of these is a negative judgment; absence is reported as absence.

export const COVERAGE_LABELS = Object.freeze({ACTIVE: '활성 판단', WATCH: '관찰 중', AWAITING_OUTCOME: '결과 대기',
  UNVERIFIABLE: '검증 불가', NOT_COVERED: '현재 커버리지 없음'});

function targetMatches(target, r) {
  if (target.entity_id && target.entity_id === r.entity_id) return true;
  const symbols = new Set((target.symbols || []).map(s => String(s).toUpperCase()));
  const ids = new Set(target.ids || []);
  if (ids.has(r.id) || ids.has(r.record_id)) return true;
  if (r.symbol && symbols.has(String(r.symbol).toUpperCase())) return true;
  if (r.record_id && symbols.has(String(r.record_id).toUpperCase())) return true;
  return (r.source_refs || []).some(s => s && s.provider_symbol && symbols.has(String(s.provider_symbol).toUpperCase()));
}

export function entityForRecord(record) {
  const ids = new Set(), macros = new Set(['DGS10','DGS2','M2SL','WALCL','CPIAUCSL','UNRATE','PAYEMS']);
  for (const ref of record.source_refs || []) {
    let url; try { url = new URL(ref.url); } catch { continue; }
    if (url.protocol !== 'https:' || url.username || url.password) continue;
    const sec = /^\/api\/xbrl\/company(?:facts|concept)\/CIK(\d{10})(?:\.json|\/[^?#]+)$/.exec(url.pathname);
    if (url.hostname === 'data.sec.gov' && sec) ids.add('SEC:CIK' + sec[1]);
    const fred = /^\/series\/([A-Z0-9_]+)$/.exec(url.pathname);
    const key = fred?.[1] || (url.pathname === '/graph/' ? url.searchParams.get('id') : null);
    if (url.hostname === 'fred.stlouisfed.org' && record.type === 'macro' && key === record.record_id && macros.has(key)) ids.add('FRED:' + key);
  }
  return ids.size === 1 ? [...ids][0] : null;
}

export function coverageFor(target, records, asOf, {manifest = null} = {}) {
  const spec = typeof target === 'string' ? {symbols: [target]} : (target || {});
  const visible = visibleAsOf(records, asOf);
  const byId = new Map(visible.map(r => [r.id, r]));
  const mine = visible.filter(r => targetMatches(spec, r));
  // Outcomes of matched forecasts belong to the target even without a symbol.
  const outcomes = mine.filter(r => r.type === 'prediction' || r.type === 'chart_forecast')
    .map(p => linkedOutcome(p, byId, asOf)).filter(Boolean);
  const all = [...mine, ...outcomes.filter(o => !mine.includes(o))];
  const result = {status: 'NOT_COVERED', market_data: 'none', evidence: 'none', forecast_forms: [], outcome_audit: 'none',
    records: all.map(r => r.id), coverage_records: [], authority: 'OUTSIDE_FIRST_COVERAGE'};
  if (!all.length) return result;
  result.market_data = all.some(r => r.type === 'analysis' || r.type === 'macro') ? 'available' : 'none';
  const existingSources = all.filter(r => (r.source_refs || []).length);
  result.evidence = existingSources.some(r => r.rights?.public_display === 'ALLOW') ? 'active' : existingSources.length ? 'restricted' : 'none';
  result.rights = all.some(r => r.rights?.status === 'RESTRICTED' || r.restricted) ? 'RESTRICTED' : 'ALLOWED';
  const valid = manifest?.schema === 'migaryos.first-coverage-manifest/1' &&
    ['VERIFIED','STALE'].includes(manifest.projection_status) && Number.isFinite(ms(manifest.as_of)) && ms(manifest.as_of) === ms(asOf);
  const identities = new Set([spec.entity_id, ...mine.map(r => r.entity_id)].filter(Boolean));
  const matchingDigest = /^[a-f0-9]{64}$/.test(manifest?.snapshot_sha256 || '') && mine.every(r => r.integrity?.snapshot_sha256 === manifest.snapshot_sha256);
  const allowed = new Set(valid && matchingDigest ? (manifest.entries || []).filter(e => identities.has(e.entity_id)).flatMap(e => e.records || []) : []);
  const covered = all.filter(r => allowed.has(r.id));
  if (!covered.length) return result;
  result.coverage_records = covered.map(r => r.id);
  result.authority = 'D4_SOURCE_BOUND';
  const forecasts = covered.filter(r => r.type === 'prediction' && !isSuperseded(r));
  const statuses = forecasts.map(f => effectiveStatus(f, asOf, byId));
  const live = statuses.some(s => s === 'AWAITING_OUTCOME');
  const audited = outcomes.some(o => allowed.has(o.id) && RESOLVED_OUTCOMES.has(o.outcome));
  const sourced = covered.filter(r => (r.source_refs || []).length);
  // Evidence is "active" only when its display rights are confirmed; sources
  // whose rights are UNKNOWN exist but are reported as restricted.
  result.evidence = sourced.some(r => (r.rights || {}).public_display === 'ALLOW') ? 'active' : sourced.length ? 'restricted' : 'none';
  result.rights = all.some(r => (r.rights || {}).status === 'RESTRICTED' || r.restricted) ? 'RESTRICTED' : 'ALLOWED';
  result.forecast_forms = [...new Set(forecasts.map(f => (f.type === 'chart_forecast' ? 'threshold' : 'event')))];
  result.outcome_audit = audited ? (live ? 'partial' : 'active') : (forecasts.length ? 'pending' : 'none');
  if (live && audited) result.status = 'ACTIVE';
  else if (live) result.status = 'AWAITING_OUTCOME';
  else if (forecasts.length && !audited) result.status = 'UNVERIFIABLE';
  else result.status = 'WATCH';
  return result;
}

// ─────────────────────────────── output guards ─────────────────────────────

export function sanitizeAnswer(text, {maxChars = 2000} = {}) {
  if (typeof text !== 'string') return '';
  const cleaned = text.replace(/<[^>]*>/g, ' ').replace(CONTROL, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
  return cleaned.length > maxChars ? cleaned.slice(0, maxChars) : cleaned;
}

const ANY_RECORD_ID = /\b(?:prediction|outcome|diary|chart|analysis|hypothesis|macro|source)-[A-Za-z0-9_.:=^/-]+|\blearning\b/g;
const BARE_RECORD_ID = /\b(?:P-\d{6}|CH-[0-9a-f]{6,})\b/gi;
const HOST_LIKE = /\b(?:[a-z][a-z0-9-]*\.)+(?:[a-z]{2,})(?:\/\S*)?/gi;
const SCHEME_LIKE = /\b(?:https?|ftp|file|javascript|data):[^\s)]*/gi;

// The model may keep only what it was given: bracket citations inside range,
// record ids that are among the evidence, and no locators of its own making.
export function keepOnlyCitedEvidence(text, evidence) {
  const ids = new Set((evidence || []).map(e => e.id));
  const recordIds = new Set((evidence || []).map(e => (e.id || '').replace(/^(?:prediction|outcome|chart|source)-/, '')));
  const max = (evidence || []).length;
  return sanitizeAnswer(String(text || '')
    .replace(/\[E(\d+)\]/g, (m, n) => (Number(n) >= 1 && Number(n) <= max ? m : ''))
    .replace(SCHEME_LIKE, '')
    .replace(HOST_LIKE, '')
    .replace(ANY_RECORD_ID, m => (ids.has(m) ? m : ''))
    .replace(BARE_RECORD_ID, m => (recordIds.has(m.replace(/^p-/i, 'P-').replace(/^ch-/i, 'CH-')) ? m : '')));
}

// A model may explain, not judge: a percentage or probability it introduces
// that the deterministic answer does not carry is a fabricated verdict.
export function introducesNumbers(text, deterministic) {
  const numbers = s => new Set((String(s || '').replace(/\[E\d+\]/g, '').replace(ANY_RECORD_ID, '').replace(BARE_RECORD_ID, '')
    .match(/[-+]?\d+(?:[.,]\d+)*(?:\s*%)?/g) || []).map(x => x.replace(/\s+/g, '')));
  const allowed = numbers(deterministic);
  for (const n of numbers(text)) if (!allowed.has(n)) return true;
  return false;
}

// Browser convenience: the whole deterministic path over one snapshot.
export function answerLocally(question, snapshot, {asOf, rights = null, paid = false, now = Date.now()} = {}) {
  const classified = classifyIntent(question);
  const records = presentRecords(recordsFromSnapshot(snapshot, {rights}), {paid, now});
  const boundary = asOf || (snapshot && snapshot.observed_at) || null;
  if (classified.intent === INTENTS.EMPTY) return {...noEvidence(classified.intent, boundary), mode: 'LOCAL_DETERMINISTIC'};
  // Staleness is a clock judgement, like the Worker's: a snapshot ages after
  // it was generated, so its own freshness label cannot be trusted alone.
  const staleAfter = Number((snapshot && snapshot.freshness && snapshot.freshness.stale_after_seconds) || 7200) * 1000;
  const aged = snapshot && Number.isFinite(ms(snapshot.observed_at)) && now - ms(snapshot.observed_at) > staleAfter;
  const projection = {status: snapshot && snapshot.integrity && snapshot.integrity.status === 'VERIFIED'
    ? (aged || (snapshot.freshness || {}).state === 'STALE' ? 'STALE' : 'VERIFIED') : 'BLOCK'};
  return {...compose({intent: classified.intent, params: classified, records, asOf: boundary, projection}), mode: 'LOCAL_DETERMINISTIC'};
}
