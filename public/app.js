/* CabanaVot — frontend SPA (fara framework, ca sa fie usor de inteles) */
const API = '';
const $ = (s) => document.querySelector(s);
const app = $('#app');
let pollTimer = null;

function stopPoll() { if (pollTimer) { clearInterval(pollTimer); pollTimer = null; } }

// ---- identitati locale ----
function getToken() { return localStorage.getItem('cabanavot_token') || ''; }
function getUser() { try { return JSON.parse(localStorage.getItem('cabanavot_user') || 'null'); } catch { return null; } }
function getVoterId() {
  let v = localStorage.getItem('cabanavot_voter');
  if (!v) { v = 'v_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('cabanavot_voter', v); }
  return v;
}

async function api(path, opts = {}) {
  const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  const t = getToken();
  if (t) headers['x-auth-token'] = t;
  const res = await fetch(API + path, Object.assign({}, opts, { headers }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Eroare de retea');
  return data;
}

function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(el._t);
  el._t = setTimeout(() => (el.hidden = true), 3200);
}

function esc(s) { return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

const PALETTE = ['#0099FF', '#000080', '#D1C885', '#16A34A', '#F59E0B', '#DC2626', '#8B5CF6', '#EC4899'];

function statusPill(s) {
  if (s === 'live') return '<span class="pill live">● LIVE</span>';
  if (s === 'closed') return '<span class="pill closed">ÎNCHIS</span>';
  return '<span class="pill draft">PROIECT</span>';
}

function quorumBox(s) {
  if (!s.quorumEnabled) return '<p class="muted tiny">Cvorum 2/3 dezactivat pentru această sesiune.</p>';
  const need = s.quorumNeeded ?? Math.ceil((s.totalEligible * 2) / 3);
  const ok = s.registered >= need;
  return `<div class="quorum-box">Cvorum 2/3 activ: din <strong>${s.totalEligible || '?'} persoane cu drept de vot</strong> trebuie să fie înregistrate <strong>${need}</strong>. Momentan înregistrate: <strong>${s.registered}</strong> — ${ok ? '✅ cvorum atins (indicativ)' : '⏳ cvorum neatins (indicativ, votul continuă oricum)'}.</div>`;
}

function barsHTML(question) {
  const total = question.total || 0;
  return question.options.map((o) => {
    const pct = total ? Math.round((o.votes / total) * 100) : 0;
    return `<div class="bar-row">
      <span class="bar-label">${esc(o.text)}</span>
      <span class="bar-votes">${o.votes} voturi • ${pct}%</span>
      <div class="bar"><div style="width:${pct}%;background:${esc(o.color || '#0099FF')}"></div></div>
    </div>`;
  }).join('') + `<p class="tiny muted">Total voturi pe întrebare: <strong>${total}</strong>. Bara fiecărei variante e colorată cu culoarea aleasă de administrator.</p>`;
}

// ---------- Router ----------
window.addEventListener('hashchange', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-nav]');
  if (a) { document.querySelectorAll('.nav a').forEach((x) => x.classList.remove('active')); }
});

function route() {
  stopPoll();
  const h = location.hash || '#/';
  document.querySelectorAll('#mainNav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === h.split('?')[0]));
  if (h.startsWith('#/voteaza')) return renderJoin();
  if (h.startsWith('#/creeaza')) return renderCreate();
  if (h.startsWith('#/editeaza/')) return renderEdit(h.split('/')[2]);
  if (h.startsWith('#/controleaza/')) return renderControl(h.split('/')[2]);
  if (h.startsWith('#/sesiunile-mele')) return renderMine();
  if (h.startsWith('#/istoric')) return renderHistory();
  return renderHome();
}

// ---------- Acasa ----------
async function renderHome() {
  let last = [];
  try { last = await api('/api/sessions'); } catch {}
  last = last.slice(0, 3);
  app.innerHTML = `
  <section class="hero">
    <div class="hero-card">
      <h1>Vot simplu, anonim și live pentru Cabana Scout</h1>
      <p>Creezi o sesiune (ex: <strong>AG primăvara 2026</strong>), primești automat un <strong>cod de acces</strong>, oamenii votează de pe telefon <strong>fără cont</strong>, iar tu controlezi când treci de la o întrebare la alta.</p>
      <div class="hero-cta">
        <a class="btn btn-bej" href="#/creeaza" data-nav>+ Creează vot</a>
        <a class="btn btn-ghost" style="background:#fff" href="#/voteaza" data-nav>Votează cu cod</a>
      </div>
      <p class="tiny" style="opacity:.85;margin-top:12px">Model inspirat de voxvote.com • design după Manualul de identitate vizuală Cabana v3.0</p>
    </div>
    <div class="hero-side">
      <div class="card">
        <h3>Intră rapid cu cod</h3>
        <div class="join-row">
          <input id="homeCode" type="text" placeholder="ex: K7P2QX" maxlength="6" style="text-transform:uppercase" />
          <button class="btn btn-primary" id="homeGo">Intră</button>
        </div>
        <p class="tiny muted">Codul îl primești de la administratorul votului.</p>
      </div>
      <div class="card">
        <h3>De ce CabanaVot?</h3>
        <div>🕵️ <strong>Anonim</strong> — nu salvăm cine ce a votat.</div>
        <div>📊 <strong>Istoric complet</strong> — toate sesiunile rămân în Istoric.</div>
        <div>⚖️ <strong>Cvorum 2/3 opțional</strong> — doar indicativ, nu blochează votul.</div>
      </div>
    </div>
  </section>
  <section class="card">
    <h2>Cum funcționează? (3 pași)</h2>
    <div class="steps">
      <div class="step"><b>1. Creezi sesiunea</b><br/>Intri cu emailul, scrii numele sesiunii, adaugi întrebări + variante colorate. Primești un cod automat.</div>
      <div class="step"><b>2. Pornești live</b><br/>Din „Controlează” apeși Start. Proiectezi codul. Votanții intră de pe telefon și votează întrebarea curentă.</div>
      <div class="step"><b>3. Vezi rezultate + istoric</b><br/>Bare colorate live, cvorum indicativ, iar la final totul rămâne în Istoric, extensibil pe sesiuni.</div>
    </div>
  </section>
  ${last.length ? `<section class="card"><h2>Ultimele sesiuni din istoric</h2>${last.map(sessionCardMini).join('')}<p><a href="#/istoric" data-nav>Vezi tot istoricul →</a></p></section>` : ''}`;
  $('#homeGo').onclick = () => {
    const c = $('#homeCode').value.trim().toUpperCase();
    if (!c) return toast('Scrie codul primit de la administrator.');
    location.hash = '#/voteaza?cod=' + encodeURIComponent(c);
  };
}

function sessionCardMini(s) {
  return `<div class="session"><button class="session-head" onclick="location.hash='#/istoric'"><span class="sname">${esc(s.name)}</span>${statusPill(s.status)}</button></div>`;
}

// ---------- Voteaza cu cod (votant, fara cont) ----------
async function renderJoin() {
  const params = new URLSearchParams((location.hash.split('?')[1] || ''));
  const prefill = (params.get('cod') || '').toUpperCase();
  app.innerHTML = `
  <section class="card">
    <h2>Votează cu cod</h2>
    <p class="muted">Nu ai nevoie de cont. Introdu codul primit de la administrator (6 caractere). Votul tău e <strong>anonim</strong>.</p>
    <div class="join-row">
      <input id="vCode" type="text" placeholder="ex: K7P2QX" maxlength="6" value="${esc(prefill)}" style="text-transform:uppercase;font-weight:900;letter-spacing:3px" />
      <button class="btn btn-primary" id="vJoin">Intră la vot</button>
    </div>
    <div id="vArea" style="margin-top:14px"></div>
  </section>`;
  $('#vJoin').onclick = () => joinSession($('#vCode').value.trim().toUpperCase());
  if (prefill) joinSession(prefill);
}

async function joinSession(code) {
  const area = $('#vArea');
  if (!code) return toast('Scrie codul.');
  const voterId = getVoterId();
  try {
    await api('/api/join/' + encodeURIComponent(code) + '/register', { method: 'POST', body: JSON.stringify({ voterId }) });
  } catch (e) { area.innerHTML = `<p style="color:var(--danger);font-weight:800">${esc(e.message)}</p>`; return; }

  async function refresh(silent) {
    try {
      const s = await api('/api/join/' + encodeURIComponent(code) + '?voterId=' + encodeURIComponent(voterId));
      if (s.status === 'draft') {
        area.innerHTML = `<div class="quorum-box">Sesiunea <strong>${esc(s.name)}</strong> încă nu e pornită. Stai aproape — administratorul o va porni. ⏳</div>`;
        return;
      }
      if (s.status === 'closed') {
        area.innerHTML = `<div class="quorum-box">Sesiunea <strong>${esc(s.name)}</strong> s-a încheiat. Mulțumim! ✅</div>`;
        stopPoll(); return;
      }
      const c = s.current;
      if (!c) { area.innerHTML = '<p class="muted">Nu există întrebare activă momentan.</p>'; return; }
      area.innerHTML = `
        <h3>${esc(s.name)} <span class="tiny muted">• întrebarea ${(s.currentIndex ?? 0) + 1} din ${s.questionsCount}</span></h3>
        ${s.quorumEnabled ? `<p class="tiny muted">Cvorum 2/3: înregistrați ${s.registered} din necesarul ${s.quorumNeeded} (indicativ).</p>` : ''}
        <p class="current-title">${esc(c.title)}</p>
        ${c.options.map((o, i) => `<button class="vote-btn ${c.myVote === i ? 'selected' : ''}" data-i="${i}"><span class="dot" style="background:${esc(o.color)}"></span> ${esc(o.text)} ${c.myVote === i ? '✓ (votul tău)' : ''}</button>`).join('')}
        <p class="tiny muted">${c.myVote != null ? 'Poți schimba votul cât timp întrebarea e activă.' : 'Atinge o variantă ca să votezi. Poți schimba votul cât timp întrebarea e activă.'} • Total voturi: <strong id="vTotal">${c.total}</strong></p>`;
      area.querySelectorAll('.vote-btn').forEach((b) => (b.onclick = async () => {
        try {
          await api('/api/vote', { method: 'POST', body: JSON.stringify({ code, questionId: c.id, optionIndex: Number(b.dataset.i), voterId }) });
          toast('Vot înregistrat anonim ✓');
          refresh(true);
        } catch (e) { toast(e.message); }
      }));
    } catch (e) { if (!silent) toast(e.message); }
  }
  await refresh();
  stopPoll();
  pollTimer = setInterval(() => refresh(true), 2500);
  toast('Te-ai alăturat anonim sesiunii ' + code);
}

// ---------- Formular creare / editare ----------
function questionBlock(q = { title: '', options: [{ text: '', color: PALETTE[0] }, { text: '', color: PALETTE[1] }] }, qi = 0) {
  return `<div class="qblock" data-q="${qi}">
    <div class="qhead">
      <strong>Întrebarea ${qi + 1}</strong>
      <input type="text" class="qtitle" placeholder="ex: Aprobați raportul de activitate?" value="${esc(q.title)}" />
      <button type="button" class="icon-btn del-q" title="Șterge întrebarea">✕</button>
    </div>
    <div class="opts">${q.options.map((o) => `
      <div class="opt-row">
        <input type="color" class="ocolor" value="${esc(o.color || '#0099FF')}" title="Culoarea barei de rezultate" />
        <input type="text" class="otext" placeholder="Variantă de răspuns (ex: DA)" value="${esc(o.text)}" />
        <button type="button" class="icon-btn del-opt" title="Șterge varianta">−</button>
      </div>`).join('')}</div>
    <button type="button" class="btn btn-ghost btn-small add-opt">+ Adaugă variantă</button>
  </div>`;
}

function collectForm() {
  const name = $('#fName').value.trim();
  const quorumEnabled = $('#fQuorum').checked;
  const totalEligible = quorumEnabled ? Number($('#fTotal').value) : null;
  const questions = [...document.querySelectorAll('.qblock')].map((qb) => ({
    id: qb.dataset.qid || undefined,
    title: qb.querySelector('.qtitle').value.trim(),
    options: [...qb.querySelectorAll('.opt-row')].map((r) => ({
      text: r.querySelector('.otext').value.trim(),
      color: r.querySelector('.ocolor').value,
    })).filter((o) => o.text),
  })).filter((q) => q.title);
  return { name, quorumEnabled, totalEligible, questions };
}

function wireForm(areaId) {
  const area = $(areaId);
  area.addEventListener('click', (e) => {
    const qb = e.target.closest('.qblock');
    if (e.target.closest('.add-opt') && qb) {
      const opts = qb.querySelector('.opts');
      const n = opts.children.length;
      opts.insertAdjacentHTML('beforeend', `<div class="opt-row"><input type="color" class="ocolor" value="${PALETTE[n % PALETTE.length]}" /><input type="text" class="otext" placeholder="Variantă nouă" /><button type="button" class="icon-btn del-opt">−</button></div>`);
    }
    if (e.target.closest('.del-opt') && qb) {
      if (qb.querySelectorAll('.opt-row').length <= 2) return toast('O întrebare trebuie să aibă cel puțin 2 variante.');
      e.target.closest('.opt-row').remove();
    }
    if (e.target.closest('.del-q')) {
      if (document.querySelectorAll('.qblock').length <= 1) return toast('Sesiunea trebuie să aibă cel puțin o întrebare.');
      qb.remove();
      renumber();
    }
  });
  function renumber() {
    document.querySelectorAll('.qblock').forEach((qb, i) => { qb.dataset.q = i; qb.querySelector('strong').textContent = 'Întrebarea ' + (i + 1); });
  }
  $('#addQ').onclick = () => {
    const n = document.querySelectorAll('.qblock').length;
    $('#qList').insertAdjacentHTML('beforeend', questionBlock(undefined, n));
  };
  $('#fQuorum').onchange = () => {
    $('#quorumFields').hidden = !$('#fQuorum').checked;
    updateQuorumHint();
  };
  $('#fTotal').oninput = updateQuorumHint;
  function updateQuorumHint() {
    const t = Number($('#fTotal').value);
    $('#quorumHint').textContent = t > 0 ? `Vor trebui să fie înregistrate cel puțin ${Math.ceil((t * 2) / 3)} persoane (2/3 din ${t}). E doar o indicație — votul pornește oricum.` : 'Scrie numărul total de persoane cu drept de vot.';
  }
}

async function renderCreate() {
  const user = getUser();
  if (!user) {
    app.innerHTML = `<section class="card"><h2>Creează vot</h2><p>Ca să creezi un vot trebuie să fii logat cu adresa de email — așa salvăm istoricul pe contul tău. Durează 10 secunde.</p><button class="btn btn-primary" onclick="document.querySelector('#loginBtn').click()">Intră cu email</button></section>`;
    return;
  }
  app.innerHTML = `
  <section class="card">
    <h2>Creează sesiune de vot</h2>
    <p class="muted">O sesiune are un nume (ex: <em>AG primăvara 2026</em>) și mai multe întrebări. Codul pentru votanți se generează <strong>automat</strong>.</p>
    <label>Numele sesiunii<input id="fName" type="text" placeholder="ex: AG primăvara 2026" /></label>
    <div class="checkline"><input id="fQuorum" type="checkbox" /><div><strong>Am nevoie de cvorum 2/3</strong><br/><span class="muted">Dacă bifezi, se deschide un câmp unde scrii câte persoane au drept de vot, iar site-ul calculează câte trebuie să fie înregistrate. E doar o indicație — votul poate începe oricum.</span></div></div>
    <div id="quorumFields" hidden><label>Câte persoane au drept de vot?<input id="fTotal" type="number" min="1" placeholder="ex: 90" /></label><span class="quorum-result" id="quorumHint"></span></div>
    <h3>Întrebări + variante (fiecare variantă poate avea culoarea ei)</h3>
    <div id="qList">${questionBlock(undefined, 0)}</div>
    <div class="row"><button class="btn btn-ghost btn-small" id="addQ">+ Adaugă întrebare</button>
    <button class="btn btn-primary" id="saveSession">Creează sesiunea</button></div>
  </section>`;
  wireForm('#qList');
  $('#saveSession').onclick = async () => {
    try {
      const body = collectForm();
      const s = await api('/api/sessions', { method: 'POST', body: JSON.stringify(body) });
      toast('Sesiune creată! Codul votanților: ' + s.code);
      location.hash = '#/controleaza/' + s.id;
    } catch (e) { toast(e.message); }
  };
}

async function renderEdit(id) {
  const user = getUser();
  if (!user) { location.hash = '#/creeaza'; return; }
  let s;
  try { s = await api('/api/sessions/' + id); } catch (e) { app.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  app.innerHTML = `
  <section class="card">
    <h2>Editează: ${esc(s.name)}</h2>
    <p class="muted">Doar tu (creatorul) poți modifica întrebările. Poți edita și în timp ce sesiunea e live.</p>
    <label>Numele sesiunii<input id="fName" type="text" value="${esc(s.name)}" /></label>
    <div class="checkline"><input id="fQuorum" type="checkbox" ${s.quorumEnabled ? 'checked' : ''} /><div><strong>Am nevoie de cvorum 2/3</strong></div></div>
    <div id="quorumFields" ${s.quorumEnabled ? '' : 'hidden'}><label>Persoane cu drept de vot<input id="fTotal" type="number" min="1" value="${esc(s.totalEligible || '')}" /></label><span class="quorum-result" id="quorumHint"></span></div>
    <div id="qList">${s.questions.map((q, i) => `<div class="qblock" data-q="${i}" data-qid="${q.id}">
      <div class="qhead"><strong>Întrebarea ${i + 1}</strong><input type="text" class="qtitle" value="${esc(q.title)}" /><button type="button" class="icon-btn del-q">✕</button></div>
      <div class="opts">${q.options.map((o) => `<div class="opt-row"><input type="color" class="ocolor" value="${esc(o.color)}" /><input type="text" class="otext" value="${esc(o.text)}" /><button type="button" class="icon-btn del-opt">−</button></div>`).join('')}</div>
      <button type="button" class="btn btn-ghost btn-small add-opt">+ Adaugă variantă</button></div>`).join('')}</div>
    <div class="row"><button class="btn btn-ghost btn-small" id="addQ">+ Adaugă întrebare oriunde (la final, apoi o muți cum vrei)</button>
    <button class="btn btn-primary" id="saveEdit">Salvează</button>
    <a class="btn btn-dark" href="#/controleaza/${s.id}" data-nav>Deschide controlul live →</a></div>
  </section>`;
  wireForm('#qList');
  $('#saveEdit').onclick = async () => {
    try {
      await api('/api/sessions/' + id, { method: 'PUT', body: JSON.stringify(collectForm()) });
      toast('Salvat ✓'); route();
    } catch (e) { toast(e.message); }
  };
}

// ---------- Sesiunile mele ----------
async function renderMine() {
  const user = getUser();
  if (!user) {
    app.innerHTML = `<section class="card"><h2>Sesiunile mele</h2><p>Intră cu emailul ca să vezi sesiunile create de tine și istoricul aferent contului.</p><button class="btn btn-primary" onclick="document.querySelector('#loginBtn').click()">Intră cu email</button></section>`;
    return;
  }
  let mine = [];
  try { mine = await api('/api/sessions/mine'); } catch (e) { app.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  app.innerHTML = `<section><h2>Sesiunile mele (${mine.length})</h2>
  ${mine.length ? mine.map((s) => `
    <div class="session">
      <div class="session-head" style="cursor:default">
        <span class="sname">${esc(s.name)}</span>${statusPill(s.status)}
      </div>
      <div class="session-body">
        <div class="share-box">Cod votanți: <strong class="code-big" style="font-size:1.3rem;padding:4px 14px">${esc(s.code)}</strong>
          <button class="btn btn-ghost btn-small" data-copy="${esc(s.code)}">Copiază codul</button>
          <button class="btn btn-ghost btn-small" data-link="${esc(s.code)}">Copiază linkul de vot</button>
        </div>
        ${quorumBox(s)}
        <p class="tiny muted">${s.questionsCount} întrebări • ${s.totalVotes} voturi • creat ${new Date(s.createdAt).toLocaleString('ro-RO')}</p>
        <div class="row">
          <a class="btn btn-primary btn-small" href="#/controleaza/${s.id}" data-nav>Controlează live</a>
          <a class="btn btn-ghost btn-small" href="#/editeaza/${s.id}" data-nav>Editează</a>
          <button class="btn btn-danger btn-small" data-del="${s.id}">Șterge</button>
        </div>
      </div>
    </div>`).join('') : '<div class="card">N-ai creat încă nicio sesiune. <a href="#/creeaza" data-nav>Creează prima →</a></div>'}
  </section>`;
  app.querySelectorAll('[data-copy]').forEach((b) => (b.onclick = () => { navigator.clipboard.writeText(b.dataset.copy); toast('Cod copiat: ' + b.dataset.copy); }));
  app.querySelectorAll('[data-link]').forEach((b) => (b.onclick = () => {
    const link = location.origin + location.pathname + '#/voteaza?cod=' + b.dataset.link;
    navigator.clipboard.writeText(link); toast('Link copiat — trimite-l votanților');
  }));
  app.querySelectorAll('[data-del]').forEach((b) => (b.onclick = async () => {
    if (!confirm('Sigur ștergi sesiunea?')) return;
    await api('/api/sessions/' + b.dataset.del, { method: 'DELETE' });
    toast('Ștearsă'); route();
  }));
}

// ---------- Istoric (toate sesiunile, extensibil) ----------
async function renderHistory() {
  let list = [];
  try { list = await api('/api/sessions'); } catch (e) { app.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  app.innerHTML = `<section>
    <h2>Istoric — toate sesiunile de vot (${list.length})</h2>
    <p class="muted">Apasă pe numele sesiunii ca să extinzi și să vezi ce s-a votat. Apoi apasă pe o întrebare ca să vezi variantele + câte persoane au votat.</p>
    <input id="hSearch" type="text" placeholder="Caută sesiune (ex: AG primăvara 2026)..." />
    <div id="hList" style="margin-top:12px">${list.map(historyItem).join('') || '<div class="card">Nicio sesiune încă.</div>'}</div>
  </section>`;
  function historyItem(s) {
    return `<div class="session" data-name="${esc(s.name.toLowerCase())}">
      <button class="session-head" data-toggle><span class="sname">📁 ${esc(s.name)}</span><span class="row">${statusPill(s.status)}<span class="tiny muted">${esc(s.code)} • ${s.questionsCount} întrebări</span></span></button>
      <div class="session-body" hidden>
        ${quorumBox(s)}
        <p class="tiny muted">Creat de ${esc(s.ownerEmail)} • ${new Date(s.createdAt).toLocaleString('ro-RO')} • ${s.totalVotes} voturi totale</p>
        ${s.questions.map((q, i) => `<div class="qitem">
          <button data-toggle>❓ ${i + 1}. ${esc(q.title)} <span class="tiny muted">(${q.total} voturi)</span></button>
          <div class="qdetail" hidden>${barsHTML(q)}</div>
        </div>`).join('')}
      </div>
    </div>`;
  }
  $('#hSearch').oninput = (e) => {
    const q = e.target.value.toLowerCase();
    document.querySelectorAll('#hList .session').forEach((el) => (el.style.display = el.dataset.name.includes(q) ? '' : 'none'));
  };
  app.addEventListener('click', toggleHandler);
  function toggleHandler(e) {
    const btn = e.target.closest('[data-toggle]');
    if (!btn || !$('#hList')) return;
    const body = btn.nextElementSibling;
    if (body) body.hidden = !body.hidden;
  }
}

// ---------- Control live (administrator) ----------
async function renderControl(id) {
  let s;
  try { s = await api('/api/sessions/' + id); } catch (e) { app.innerHTML = `<p>${esc(e.message)}</p>`; return; }
  const me = getUser();
  const isOwner = me && s.ownerEmail === me.email;

  async function refresh() {
    try { s = await api('/api/sessions/' + id); paint(); } catch {}
  }

  function paint() {
    const cur = s.currentIndex >= 0 ? s.questions[s.currentIndex] : null;
    app.innerHTML = `
    <section>
      <div class="row"><a href="#/sesiunile-mele" data-nav>← Sesiunile mele</a></div>
      <h2>Controlează: ${esc(s.name)} ${statusPill(s.status)}</h2>
      <div class="share-box">Cod votanți: <strong class="code-big" style="font-size:1.4rem">${esc(s.code)}</strong>
        <button class="btn btn-ghost btn-small" id="copyCode">Copiază codul</button>
        <button class="btn btn-ghost btn-small" id="copyLink">Copiază linkul</button>
        <span class="tiny muted">Trimite codul/linkul votanților. Ei nu au nevoie de cont.</span>
      </div>
      ${quorumBox(s)}
      <div class="live-grid">
        <div class="tree">
          <strong>📋 Toată sesiunea</strong>
          <p class="tiny muted">La început vezi doar numele. Apasă pe sesiune → întrebări → variante + voturi.</p>
          <details open><summary>📁 ${esc(s.name)} (${s.questions.length} întrebări)</summary>
            <div style="padding:8px">
            ${s.questions.map((q, i) => `<details ${i === s.currentIndex ? 'open' : ''}><summary class="${i === s.currentIndex ? 'live-q' : ''}">${i === s.currentIndex ? '▶ ' : ''}${i + 1}. ${esc(q.title)} (${q.total})</summary>
              <div class="tree-opts">${barsHTML(q)}<button class="btn btn-ghost btn-small" data-goto="${i}">Mergi la această întrebare</button></div></details>`).join('')}
            </div>
          </details>
          <div class="card" style="margin-top:10px"><strong>+ Adaugă vot nou live</strong>
            <label>Titlu întrebare<input id="liveTitle" type="text" placeholder="ex: Vot de ultim moment" /></label>
            <label>După ce întrebare? (poziția)<select id="livePos">${s.questions.map((q, i) => `<option value="${i + 1}">După ${i + 1}. ${esc(q.title.slice(0, 30))}</option>`).join('')}<option value="0">La început</option></select></label>
            <label>Variante (separate prin virgulă)<input id="liveOpts" type="text" placeholder="ex: DA, NU, ABȚINERE" /></label>
            <button class="btn btn-dark btn-small" id="liveAdd">Adaugă în ordine</button>
          </div>
        </div>
        <div>
          <div class="card current-card">
            ${s.status === 'draft' ? `<h3>Sesiunea e încă proiect.</h3><p>Apasă <strong>Pornește votul</strong> când ești gata. Votanții cu codul <strong>${esc(s.code)}</strong> așteaptă.</p>` : ''}
            ${cur ? `<p class="tiny muted">Întrebarea ${s.currentIndex + 1} din ${s.questions.length} • Total voturi aici: <strong>${cur.total}</strong> • Înregistrați: <strong>${s.registered}</strong></p>
            <p class="current-title">${esc(cur.title)}</p>${barsHTML(cur)}` : '<p>Nu există întrebare curentă.</p>'}
            <div class="row" style="margin-top:12px">
              ${s.status === 'draft' ? '<button class="btn btn-primary" id="cStart">▶ Pornește votul</button>' : ''}
              ${s.status === 'live' ? '<button class="btn btn-ghost btn-small" id="cPrev">← Precedenta</button><button class="btn btn-primary btn-small" id="cNext">Următoarea →</button><button class="btn btn-danger btn-small" id="cClose">■ Închide sesiunea</button>' : ''}
              ${s.status === 'closed' ? '<button class="btn btn-primary btn-small" id="cReopen">↻ Redeschide</button>' : ''}
              <a class="btn btn-ghost btn-small" href="#/editeaza/${s.id}" data-nav>Editează întrebări</a>
            </div>
          </div>
          ${!isOwner ? '<p class="tiny muted">Vezi acest panou pentru că ești pe linkul de admin. Doar creatorul (' + esc(s.ownerEmail) + ') poate controla efectiv sesiunea.</p>' : ''}
        </div>
      </div>
    </section>`;
    $('#copyCode').onclick = () => { navigator.clipboard.writeText(s.code); toast('Cod copiat'); };
    $('#copyLink').onclick = () => { navigator.clipboard.writeText(location.origin + location.pathname + '#/voteaza?cod=' + s.code); toast('Link copiat'); };
    const ctl = async (body) => { try { s = await api('/api/sessions/' + id + '/control', { method: 'POST', body: JSON.stringify(body) }); paint(); } catch (e) { toast(e.message); } };
    if ($('#cStart')) $('#cStart').onclick = () => ctl({ action: 'start' });
    if ($('#cNext')) $('#cNext').onclick = () => ctl({ action: 'next' });
    if ($('#cPrev')) $('#cPrev').onclick = () => ctl({ action: 'prev' });
    if ($('#cClose')) $('#cClose').onclick = () => ctl({ action: 'close' });
    if ($('#cReopen')) $('#cReopen').onclick = () => ctl({ action: 'reopen' });
    app.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => ctl({ action: 'goto', index: Number(b.dataset.goto) })));
    if ($('#liveAdd')) $('#liveAdd').onclick = async () => {
      const title = $('#liveTitle').value.trim();
      const opts = $('#liveOpts').value.split(',').map((x) => x.trim()).filter(Boolean);
      if (!title || opts.length < 2) return toast('Scrie titlul + cel puțin 2 variante separate prin virgulă.');
      const pos = Number($('#livePos').value);
      const qs = s.questions.map((q) => ({ id: q.id, title: q.title, options: q.options.map((o) => ({ text: o.text, color: o.color })) }));
      qs.splice(pos, 0, { title, options: opts.map((t, i) => ({ text: t, color: PALETTE[i % PALETTE.length] })) });
      try { s = await api('/api/sessions/' + id, { method: 'PUT', body: JSON.stringify({ questions: qs }) }); paint(); toast('Întrebare adăugată live ✓'); }
      catch (e) { toast(e.message); }
    };
  }
  paint();
  stopPoll();
  pollTimer = setInterval(refresh, 2500);
}

// ---------- Login / header ----------
function refreshHeader() {
  const u = getUser();
  $('#userBadge').hidden = !u;
  if (u) $('#userBadge').textContent = '👤 ' + u.name + ' • ' + u.email;
  $('#loginBtn').textContent = u ? 'Ieși' : 'Intră cu email';
}
$('#loginBtn').onclick = () => {
  if (getUser()) {
    localStorage.removeItem('cabanavot_token');
    localStorage.removeItem('cabanavot_user');
    refreshHeader(); toast('Ai ieșit.'); route(); return;
  }
  $('#loginModal').hidden = false;
};
$('#closeLogin').onclick = () => ($('#loginModal').hidden = true);
$('#doLogin').onclick = async () => {
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: $('#loginEmail').value, name: $('#loginName').value }) });
    localStorage.setItem('cabanavot_token', r.token);
    localStorage.setItem('cabanavot_user', JSON.stringify(r.user));
    $('#loginModal').hidden = true;
    refreshHeader(); toast('Bun venit, ' + r.user.name + '!');
    route();
  } catch (e) { toast(e.message); }
};
$('#hamburger').onclick = () => $('#mainNav').classList.toggle('open');

refreshHeader();
route();
