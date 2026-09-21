// World Chat inside the WIE Lens.
//
// Renders only text nodes, never markup strings. With an endpoint configured the
// question goes to the Worker; without one, or when the Worker cannot be
// reached, the same deterministic core answers in the browser from the
// snapshot already on the page — and says so. Evidence chips move the camera
// to the cited star. Execution controls are never rendered on the public site.
import {answerLocally, recordsFromSnapshot, presentRecords, coverageFor, COVERAGE_LABELS, RELATION_LABELS, STATUS_LABELS, TYPE_LABELS, NO_EVIDENCE_ANSWER} from './world_core.js';

const QUESTION_LIMIT = 500;
const MODE_TEXT = {LOCAL_DETERMINISTIC: 'LLM 미사용 · 저장된 공개 기록에서 결정론으로 답했습니다.',
  LOCAL_FALLBACK: '서버에 연결하지 못해 저장된 공개 기록으로 답했습니다 (LLM 미사용).',
  REMOTE: '공개 projection 서버가 답했습니다.'};
const LLM_TEXT = {USED: '모델이 근거 문장을 다듬었습니다 (GENERATED). 근거 ID와 아래 결정론 답으로 확인하세요.', NOT_NEEDED: '결정론 응답 · 모델 미사용.',
  UNAVAILABLE: '모델을 쓸 수 없어 결정론 응답만 제공합니다.', TIMEOUT: '모델 응답이 늦어 결정론 응답만 제공합니다.',
  BUDGET_EXHAUSTED: '오늘의 공용 모델 예산이 소진돼 결정론 응답만 제공합니다.', QUOTA_EXHAUSTED: '이 요금제의 AI 질의 한도가 소진돼 결정론 응답만 제공합니다. 정형 조회는 계속 됩니다.',
  BUSY: '모델이 붐벼 결정론 응답만 제공합니다.', RIGHTS_RESTRICTED: '근거의 원천 자료 권리가 확인되지 않아 모델에 전달하지 않았습니다.',
  REJECTED_NUMBERS: '모델이 근거에 없는 수치를 만들어 그 문장을 버리고 결정론 응답을 표시합니다.',
  FALLBACK: '모델 출력이 비어 결정론 응답을 그대로 표시합니다.', DISABLED: '모델 사용이 꺼져 있습니다.'};
// Every status the Worker can emit has a sentence; a refusal never borrows
// the "no evidence" wording, because refused and unsupported are different.
const STATUS_TEXT = {OK: '', NO_EVIDENCE: '확인할 근거가 없습니다.', PROJECTION_STALE: '공개 기록이 오래돼 최신 상태를 보장하지 않습니다 (stale).',
  BUDGET_EXHAUSTED: '오늘의 공용 모델 예산이 소진됐습니다. 아래 답은 결정론 응답입니다.',
  RATE_LIMITED: '요청이 많습니다. 잠시 후 다시 시도하세요.', QUOTA_EXHAUSTED: '이 요금제의 AI 질의 한도에 도달했습니다. 정형 조회와 기록 열람은 계속 쓸 수 있습니다.',
  PROJECTION_UNAVAILABLE: '공개 기록을 검증하지 못해 답할 수 없습니다 (source failure).', FORBIDDEN_ORIGIN: '이 화면에서는 서버에 물을 수 없습니다.',
  INVALID_INPUT: '질문은 1자 이상 ' + QUESTION_LIMIT + '자 이하로 적어 주세요.', PAYLOAD_TOO_LARGE: '요청이 너무 큽니다.',
  TURNSTILE_REQUIRED: '사람 확인이 필요합니다.', TURNSTILE_FAILED: '사람 확인에 실패했습니다.', IDENTITY_REQUIRED: '로그인이 필요한 기능입니다.',
  FORBIDDEN: '이 workspace에서 허용되지 않은 동작입니다.', PLAN_DOES_NOT_ALLOW: '이 요금제에서는 저장할 수 없습니다.', PLAN_LIMIT_REACHED: '저장 한도에 도달했습니다.',
  METHOD_NOT_ALLOWED: '지원하지 않는 요청입니다.', EXPORT_NOT_ENABLED: '내보내기는 제공하지 않습니다.', NOT_FOUND: '없는 경로입니다.'};
const ANSWER_STATUSES = new Set(['OK', 'NO_EVIDENCE', 'PROJECTION_STALE', 'BUDGET_EXHAUSTED']);
const CONFIDENCE_TEXT = {high: '확신 높음 (원장 조회)', medium: '확신 보통 (검색·집계)', low: '확신 낮음', unknown: '확신 미정'};

function newSession() {
  try { if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') return globalThis.crypto.randomUUID(); } catch { /* fall through */ }
  return 's' + Math.random().toString(36).slice(2, 12) + Date.now().toString(36);
}

export function createWorldChat({universe, document, endpoint = null, fetchImpl = null, session = newSession(), rights = null, firstCoverage = null} = {}) {
  const el = (tag, text, cls) => { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (cls) n.className = cls; return n; };
  let cache = {key: null, records: [], byId: new Map()};
  let view = null;
  let lastResponse = null;

  function projection() {
    const snap = universe.snapshot();
    const key = snap ? snap.generated_at + ':' + snap.observed_at : null;
    if (key !== cache.key) {
      const records = snap ? presentRecords(recordsFromSnapshot(snap, {rights}), {paid: false}) : [];
      cache = {key, records, byId: new Map(records.map(r => [r.id, r]))};
    }
    return cache;
  }

  function storyFor(id) {
    const r = projection().byId.get(id);
    if (!r) return null;
    return {id: r.id, star_label: r.title, title: r.title, kind: (TYPE_LABELS[r.type] || r.type) + ' · ' + (STATUS_LABELS[r.status] || r.status),
      summary: r.summary, times: [{label: '기준 시각', value: r.as_of || '미확인'}, ...(r.observed_at ? [{label: '관측 시각', value: r.observed_at}] : [])],
      sections: [{title: '기록 내용', body: r.content}], sources: (r.source_refs || []).filter(s => s && s.url).map(s => ({label: s.attribution || '출처 열기', url: s.url})),
      node_labels: [r.record_id]};
  }
  if (typeof universe.registerStoryResolver === 'function') universe.registerStoryResolver(storyFor);

  function workspaceLinks(record) {
    const r = projection().byId.get(record && record.id);
    const box = el('p', undefined, 'story-limit wc-routes');
    const lens = el('a', 'WIE Lens · 근거와 판단 상세');lens.href='/wie/?focus='+encodeURIComponent(record.id);box.append(lens);
    if (r && r.symbol) {
      const a = el('a', 'Market 보기 · ' + r.symbol); a.href = '/market/?symbol=' + encodeURIComponent(r.symbol)+(r.entity_id?'&entity='+encodeURIComponent(r.entity_id):''); box.append(a);
      const q = el('a', 'Quant 연구 보기'); q.href = '/quant/?focus=' + encodeURIComponent(r.id)+'#research'; box.append(q);
    } else {
      box.append(el('span', '이 기록에는 시장 화면이 없습니다. WIE 기록과 거시 관측으로 대신 봅니다. '));
      const a = el('a', '거시 관측 기록'); a.href = '/record/#market-context'; box.append(a);
    }
    return box;
  }

  function legend() {
    const details = el('details', undefined, 'wc-legend');
    details.append(el('summary', '범례 · 선과 상태의 뜻'));
    const dl = el('dl');
    for (const [k, v] of Object.entries(RELATION_LABELS)) { dl.append(el('dt', '선 · ' + v), el('dd', k + ' — 화면의 연결이며 인과 입증이 아닙니다.')); }
    for (const k of ['AWAITING_OUTCOME', 'EXPIRED_UNRESOLVED', 'RESOLVED', 'UNVERIFIABLE', 'INVALID']) { dl.append(el('dt', '상태 · ' + STATUS_LABELS[k]), el('dd', k + (k === 'RESOLVED' ? '' : ' — 실패나 부정 판단이 아닙니다.'))); }
    details.append(dl);
    return details;
  }

  // The Lens header: what WIE knows about this record, what it judges, and
  // what is unresolved — before any chat. Every value is deterministic.
  function lensSummary(record) {
    const {records, byId} = projection();
    const r = byId.get(record && record.id);
    const box = el('section', undefined, 'story-section wc-lens');
    box.setAttribute('aria-label', 'WIE Lens 요약');
    box.append(el('h5', 'WIE Lens · 무엇을 알고, 무엇을 판단하며, 무엇이 미해결인가'));
    if (!r) { box.append(el('p', 'WIE coverage: 이 기록은 공개 projection에 없습니다 (NOT_COVERED). 부정 판단이 아닙니다.', 'story-limit')); return box; }
    const snap = universe.snapshot() || {};
    const target = {entity_id: r.entity_id, symbols: r.symbol ? [r.symbol] : [], ids: [r.id, r.record_id]};
    const coverage = coverageFor(target, records, snap.observed_at, {manifest: firstCoverage});
    const links = r.links || [];
    const count = rel => links.filter(l => l.relation === rel).length;
    const dl = el('dl', undefined, 'story-times');
    const rows = [['WIE coverage', (COVERAGE_LABELS[coverage.status] || coverage.status) + ' (' + coverage.status + ')'],
      ['기록 상태', (STATUS_LABELS[r.status] || r.status) + (r.restricted ? ' · 권리 제한 (rights-restricted)' : '')],
      ['기준 시각 (as_of)', r.as_of || '미확인'], ['공개 시각', r.published_at || '미확인'],
      ['근거 (출처)', count('cites') + '건'],
      ['연결된 반대근거·가설', (() => { const n = records.filter(x => x.type === 'hypothesis' && r.symbol && x.symbol === r.symbol).length; return n ? n + '건' : '연결된 반대근거 없음'; })()],
      ['기록된 결과', count('recorded_outcome') ? '있음' : '없음 · 미확정은 실패가 아닙니다'],
      ['발행 시점의 일기', count('issued_in_window') + '건']];
    if (r.valid_until) rows.splice(3, 0, ['유효 기한', r.valid_until]);
    if (typeof r.probability === 'number') rows.splice(2, 0, ['등록 확률', (r.probability * 100).toFixed(1) + '% (등록값 · 예측력 증거 아님)']);
    for (const [k, v] of rows) dl.append(el('dt', k), el('dd', v));
    box.append(dl);
    return box;
  }

  function mount(rows, record) {
    // Identity → coverage comes first (PRODUCT.md Lens order), before the story body.
    if (typeof rows.prepend === 'function') rows.prepend(lensSummary(record)); else rows.append(lensSummary(record));
    const section = el('section', undefined, 'story-section world-chat');
    section.setAttribute('aria-label', 'World Chat');
    section.append(el('h5', 'World Chat · 이 기록에 대해 묻기'));
    section.append(el('p', '공개 기록의 근거만으로 답합니다. 근거가 없으면 없다고 말합니다. 생성된 문장은 근거가 아니며, 근거 ID로 확인하세요.', 'story-limit'));
    const form = el('form', undefined, 'wc-form');
    const label = el('label', '질문'); label.setAttribute('for', 'wc-input'); form.append(label);
    const input = el('input'); input.id = 'wc-input'; input.setAttribute('type', 'text'); input.setAttribute('maxlength', String(QUESTION_LIMIT));
    input.setAttribute('autocomplete', 'off'); input.setAttribute('placeholder', '예: 결국 맞았나 · 왜 예측했나 · 최근 예측 · 지난 30일 적중률');
    form.append(input);
    const button = el('button', '묻기'); button.setAttribute('type', 'submit'); form.append(button);
    const status = el('p', '', 'wc-status'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const answer = el('div', undefined, 'wc-answer');
    const evidence = el('div', undefined, 'wc-evidence');
    view = {section, input, button, status, answer, evidence, record};
    form.addEventListener('submit', event => { if (event && event.preventDefault) event.preventDefault(); ask(input.value, {focus: record && record.id}); });
    section.append(form, status, answer, evidence, legend(), workspaceLinks(record));
    const last = rows.children && rows.children[rows.children.length - 1];
    if (last && last.tagName === 'BUTTON' && typeof rows.insertBefore === 'function') rows.insertBefore(section, last);
    else rows.append(section);
    return section;
  }

  function render(response, mode) {
    lastResponse = {...response, mode};
    if (!view) return lastResponse;
    const parts = [];
    if (response.status && STATUS_TEXT[response.status] !== undefined) { if (STATUS_TEXT[response.status]) parts.push(STATUS_TEXT[response.status]); }
    else if (response.status) parts.push('상태 ' + response.status);
    parts.push(MODE_TEXT[mode] || mode);
    if (mode === 'REMOTE' && response.llm && LLM_TEXT[response.llm]) parts.push(LLM_TEXT[response.llm]);
    if (response.confidence) parts.push(CONFIDENCE_TEXT[response.confidence] || response.confidence);
    if (response.as_of) parts.push('기준 시각 ' + response.as_of);
    view.status.textContent = parts.join(' · ');
    if (!ANSWER_STATUSES.has(response.status)) {
      // A refusal or an error is shown as its state, never as an answer.
      view.answer.replaceChildren(el('p', STATUS_TEXT[response.status] || ('상태 ' + response.status), 'wc-refusal'));
      view.evidence.replaceChildren();
      return lastResponse;
    }
    const body = String(response.answer || NO_EVIDENCE_ANSWER).split('\n').map(line => el('p', line));
    if (response.generated && response.deterministic_answer) {
      const generated = el('div', undefined, 'wc-generated');
      generated.append(el('p', 'GENERATED · 모델이 다듬은 문장', 'story-limit'), ...body);
      const det = el('details'); det.append(el('summary', '결정론 답 (검증된 원문)'), ...String(response.deterministic_answer).split('\n').map(line => el('p', line)));
      view.answer.replaceChildren(generated, det);
    } else {
      view.answer.replaceChildren(...body);
    }
    const chips = [];
    (response.evidence || []).forEach((e, i) => {
      const chip = el('button', '[E' + (i + 1) + '] ' + (e.title || e.id) + (e.type ? ' · ' + (TYPE_LABELS[e.type] || e.type) : '') + (e.restricted ? ' · 권리 제한' : ''), 'wc-chip');
      chip.setAttribute('type', 'button'); chip.dataset.recordId = e.id; chip.setAttribute('aria-label', '근거 ' + (i + 1) + ' ' + (e.title || e.id) + ' 별로 이동');
      chip.addEventListener('click', () => {
        const moved = universe.focusStory(e.id);
        if (!moved) {
          view.status.textContent = '이 기록은 현재 우주 화면에 별이 없습니다.' + (e.locator && e.locator.href ? ' 기록 페이지에서 확인하세요.' : '');
          if (e.locator && e.locator.href) { const a = el('a', '기록 페이지 열기'); a.href = e.locator.href; view.evidence.append(a); }
        }
      });
      chips.push(chip);
      for (const credit of e.attributions || []) chips.push(el('small', credit, 'wc-attribution'));
    });
    view.evidence.replaceChildren(...chips);
    return lastResponse;
  }

  async function ask(question, {focus} = {}) {
    const text = typeof question === 'string' ? question.normalize('NFC').replace(/\s+/g, ' ').trim() : '';
    if (!text || [...text].length > QUESTION_LIMIT) return render({status: 'INVALID_INPUT', answer: STATUS_TEXT.INVALID_INPUT, evidence: []}, endpoint ? 'REMOTE' : 'LOCAL_DETERMINISTIC');
    if (view) { view.status.textContent = '확인 중…'; view.button.disabled = true; }
    try {
      if (endpoint && fetchImpl) {
        try {
          const res = await fetchImpl(endpoint, {method: 'POST', credentials: 'omit', mode: 'cors', cache: 'no-store',
            headers: {'content-type': 'application/json'}, body: JSON.stringify({question: text, session, focus: focus || undefined}),
            signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined});
          const data = await res.json();
          if (!data || typeof data !== 'object') throw new Error('schema');
          return render(data, 'REMOTE');
        } catch {
          const local = answerLocally(text, universe.snapshot(), {rights});
          return render(local, 'LOCAL_FALLBACK');
        }
      }
      return render(answerLocally(text, universe.snapshot(), {rights}), 'LOCAL_DETERMINISTIC');
    } finally {
      if (view) view.button.disabled = false;
    }
  }

  return {mount, ask, storyFor, get lastResponse() { return lastResponse; }, session};
}

if (typeof window !== 'undefined' && window.WIEUniverse && window.document) {
  const chat = createWorldChat({universe: window.WIEUniverse, document: window.document,
    firstCoverage: window.FIRST_COVERAGE || null,
    rights: window.WIE_SOURCE_RIGHTS && window.WIE_SOURCE_RIGHTS.schema === 'migaryos.source-rights/1' ? window.WIE_SOURCE_RIGHTS : null,
    endpoint: typeof window.WIE_WORLD_CHAT_ENDPOINT === 'string' && /^https:\/\//.test(window.WIE_WORLD_CHAT_ENDPOINT) ? window.WIE_WORLD_CHAT_ENDPOINT : null,
    fetchImpl: typeof window.fetch === 'function' ? window.fetch.bind(window) : null});
  window.WIEUniverse.onStory((rows, record) => chat.mount(rows, record));
  window.WIEWorldChat = chat;
  const search=window.WIESearch,host=window.document.getElementById('universe-search-candidates'),input=window.document.getElementById('universe-search');
  if(search&&host&&input){
    const staticOnly=window.document.body.dataset.worldDelivery==='STATIC_READ_ONLY';let box;
    const workspace=window.WIEWorkspace?.createWorkspace({fetchImpl:window.fetch.bind(window),staticOnly,onChange:()=>box?.update()});
    const rights=window.WIE_SOURCE_RIGHTS||null;
    box=search.mount({document:window.document,input,host,
      localItems:()=>search.recordItems(presentRecords(recordsFromSnapshot(window.WIEUniverse.snapshot(),{rights}),{paid:false}),
        {stale:window.WIEUniverse.snapshot()?.freshness?.state==='STALE'||Date.now()-Date.parse(window.WIEUniverse.snapshot()?.observed_at)>Number(window.WIEUniverse.snapshot()?.freshness?.stale_after_seconds||7200)*1000}),loadItems:search.registryLoader(window.fetch.bind(window)),
      onSelect:item=>{if(item.kind==='record')window.WIEUniverse.focusStory(item.id);else window.location.href='/wie/?entity='+encodeURIComponent(item.canonical);},
      onWatch:staticOnly||!workspace?null:item=>{if(!workspace.state.principal){window.location.href='/wie/?'+(item.kind==='record'?'focus='+encodeURIComponent(item.id):'entity='+encodeURIComponent(item.canonical))+'&login=save';return false;}return workspace.toggleSaved(item.target);},saved:item=>!!workspace?.state.saved.includes(item.target),
      watchState:()=>({busy:workspace?.busy,readOnly:workspace?.state.principal?.role==='viewer',message:workspace?.state.message})});
    window.document.getElementById('universe-search-form').addEventListener('submit',event=>{event.preventDefault();if(!box.suppressSubmit())input.focus();});
    workspace?.refresh();window.addEventListener('pagehide',()=>{box.destroy();workspace?.destroy();});
  }
  const selected = window.WIEUniverse.selected && window.WIEUniverse.selected();
  if (selected) { const story = window.WIEUniverse.stories().find(r => r.id === selected); if (story) window.WIEUniverse.showStory(story); }
}
