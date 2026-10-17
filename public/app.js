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
  if (!s.quorumEnabled) return ''; // daca nu e pornit, nu scriem nimic despre el
  const need = s.quorumNeeded ?? Math.ceil((s.totalEligible * 2) / 3);
  const ok = s.registered >= need;
  return `<div class="quorum-box">Cvorumul este <strong>${need} persoane</strong> (2/3 din ${s.totalEligible || '?'} cu drept de vot). Înregistrate: <strong>${s.registered}</strong> — ${ok ? '✅ cvorum atins (indicativ)' : '⏳ cvorum neatins (indicativ, votul continuă oricum)'}.</div>`;
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
  }).join('');
}

// ---------- Router ----------
window.addEventListener('hashchange', route);
document.addEventListener('click', (e) => {
  const a = e.target.closest('[data-nav]');
  if (a) { document.querySelectorAll('.nav a').forEach((x) => x.classList.remove('active')); }
});
// Extindere/pliere (istoric, lista live) — UN SINGUR handler global.
// Inainte se adauga un handler nou la fiecare vizita a paginii, iar dublurile
// faceau ca un click sa deschida si sa inchida instantaneu (parea ca "nu merge").
document.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-toggle]');
  if (!btn) return;
  const body = btn.nextElementSibling;
  if (body) body.hidden = !body.hidden;
});

function route() {
  stopPoll();
  const h = location.hash || '#/';
  // Butonul "+ Creează vot" din bara de sus dispare cand esti deja in formularul de vot.
  const createBtn = $('#createBtn');
  if (createBtn) createBtn.hidden = h.startsWith('#/creeaza') || h.startsWith('#/editeaza');
  const activeHref = h.startsWith('#/bine-ai-venit') || h.startsWith('#/platforma') ? '#/' : h.split('?')[0];
  document.querySelectorAll('#mainNav a').forEach((a) => a.classList.toggle('active', a.getAttribute('href') === activeHref));
  if (h.startsWith('#/bine-ai-venit')) return renderWelcome();
  if (h.startsWith('#/platforma')) return renderHome();
  if (h.startsWith('#/voteaza')) return renderJoin();
  if (h.startsWith('#/creeaza')) return renderCreate();
  if (h.startsWith('#/editeaza/')) return renderEdit(h.split('/')[2]);
  if (h.startsWith('#/controleaza/')) return renderControl(h.split('/')[2]);
  if (h.startsWith('#/sesiunile-mele')) return renderMine();
  if (h.startsWith('#/istoric')) return renderHistory();
  // Pagina de start: „Bine ai venit la AG" apare doar PRIMA DATA cand intri pe site
  // (dupa ce ai vazut-o o data, Acasa duce la pagina normala).
  return getUser() && !localStorage.getItem('cabanavot_welcome_seen') ? renderWelcome() : renderHome();
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
        <div>♾️ <strong>Sesiuni de vot nelimitate</strong> — creezi câte vrei.</div>
      </div>
    </div>
  </section>
  <section class="card">
    <h2>Cum funcționează? (3 pași)</h2>
    <div class="steps">
      <div class="step"><b>1. Creezi sesiunea</b><br/>Creezi o sesiune, adaugi întrebări și gata AG-ul într-o oră.</div>
      <div class="step"><b>2. Pornești live</b><br/>Proiectezi codul. Votanții intră de pe telefon și votează întrebarea curentă.</div>
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

// ---------- Pagina de pornire (prima pagina dupa login — doar prima data) ----------
function renderWelcome() {
  localStorage.setItem('cabanavot_welcome_seen', '1');
  app.innerHTML = `
  <section class="welcome">
    <div class="welcome-card">
      <img src="logo.png" alt="Logo Cabana Scout" width="92" height="92" />
      <h1>Bine ai venit la AG</h1>
      <a class="btn btn-primary" href="#/platforma" data-nav>Continuă →</a>
    </div>
  </section>`;
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

  let lastStatus = null;
  async function refresh(silent) {
    try {
      const s = await api('/api/join/' + encodeURIComponent(code) + '?voterId=' + encodeURIComponent(voterId));
      lastStatus = s.status;
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
      const voted = c.myVote != null;
      area.innerHTML = `
        <h3>${esc(s.name)} <span class="tiny muted">• întrebarea ${(s.currentIndex ?? 0) + 1} din ${s.questionsCount}</span></h3>
        ${s.quorumEnabled ? `<p class="tiny muted">Cvorum 2/3: înregistrați ${s.registered} din necesarul ${s.quorumNeeded} (indicativ).</p>` : ''}
        <p class="current-title">${esc(c.title)}</p>
        ${c.options.map((o, i) => `<button class="vote-btn ${c.myVote === i ? 'selected' : ''}" data-i="${i}" ${voted ? 'disabled' : ''}><span class="dot" style="background:${esc(o.color)}"></span> ${esc(o.text)} ${c.myVote === i ? '✓ (votul tău)' : ''}</button>`).join('')}
        <p class="tiny muted">${voted
          ? 'Votul tău a fost înregistrat. Acum așteaptă următoarea întrebare — votul nu mai poate fi schimbat.'
          : 'Atinge o variantă ca să votezi. După ce votezi, votul rămâne înregistrat și nu mai poate fi schimbat.'} • Total voturi: <strong id="vTotal">${c.total}</strong></p>`;
      area.querySelectorAll('.vote-btn').forEach((b) => (b.onclick = async () => {
        if (b.disabled) return;
        // blocam butoanele imediat, ca un dublu-click sa nu trimita doua voturi
        area.querySelectorAll('.vote-btn').forEach((x) => (x.disabled = true));
        try {
          await api('/api/vote', { method: 'POST', body: JSON.stringify({ code, questionId: c.id, optionIndex: Number(b.dataset.i), voterId }) });
          toast('Vot înregistrat anonim ✓ Așteaptă următoarea întrebare.');
        } catch (e) { toast(e.message); }
        refresh(true);
      }));
    } catch (e) { if (!silent) toast(e.message); }
  }
  await refresh();
  toast('Te-ai alăturat anonim sesiunii ' + code);
  if (lastStatus !== 'closed') {
    stopPoll();
    pollTimer = setInterval(() => refresh(true), 2500);
  }
}

// ---------- Formular creare / editare ----------
function questionBlock(q = { title: '', options: [{ text: '', color: PALETTE[0] }, { text: '', color: PALETTE[1] }] }, qi = 0) {
  return `<div class="qblock" data-q="${qi}">
    <div class="qhead">
      <span class="drag-handle" title="Ține apăsat și trage ca să muți întrebarea">⠿</span>
      <strong>Întrebarea ${qi + 1}</strong>
      <input type="text" class="qtitle" placeholder="ex: Aprobați raportul de activitate?" value="${esc(q.title)}" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" />
      <button type="button" class="icon-btn del-q" title="Șterge întrebarea">✕</button>
    </div>
    <div class="opts">${q.options.map((o) => `
      <div class="opt-row">
        <input type="color" class="ocolor" value="${esc(o.color || '#0099FF')}" title="Culoarea barei de rezultate" />
        <input type="text" class="otext" placeholder="Variantă de răspuns (ex: DA)" value="${esc(o.text)}" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" />
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

function wireForm(areaId, onReorder) {
  const area = $(areaId);
  area.addEventListener('click', (e) => {
    const qb = e.target.closest('.qblock');
    if (e.target.closest('.add-opt') && qb) {
      const opts = qb.querySelector('.opts');
      const n = opts.children.length;
      opts.insertAdjacentHTML('beforeend', `<div class="opt-row"><input type="color" class="ocolor" value="${PALETTE[n % PALETTE.length]}" /><input type="text" class="otext" placeholder="Variantă nouă" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" /><button type="button" class="icon-btn del-opt">−</button></div>`);
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

  // ---------- Sageata sus/jos = muta cursorul in casuta urmatoare / de mai sus ----------
  // Exemplu: scrii titlul intrebarii 1, apesi sageata jos si mergi direct la prima varianta.
  const card = area.closest('.card') || area;
  card.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const t = e.target;
    if (!t || t.tagName !== 'INPUT' || t.type !== 'text') return;
    const inputs = [...card.querySelectorAll('input[type=text]')].filter((el) => !el.disabled && el.offsetParent !== null);
    const next = e.key === 'ArrowDown' ? inputs[inputs.indexOf(t) + 1] : inputs[inputs.indexOf(t) - 1];
    if (next) { e.preventDefault(); next.focus(); }
  });

  // ---------- Mutarea intrebarilor: tine apasat si trage (merge si pe telefon) ----------
  // Tine apasat pe manerul ⠿ din capul intrebarii (sau pe zona goala a intrebarii),
  // misca degetul/pointerul peste alta intrebare si elibereaza ca sa o muti.
  let drag = null; // intrebarea care e trasa acum
  let pre = null;  // ascultatorii timer-ului de dinainte de „pornire"
  const blockScroll = (ev) => ev.preventDefault(); // pe telefon: nu lasa pagina sa deruleze cand tragi

  area.addEventListener('pointerdown', (e) => {
    if (e.button != null && e.button > 0) return; // doar click stanga
    const qb = e.target.closest('.qblock');
    if (!qb || !area.contains(qb)) return;
    const onHandle = !!e.target.closest('.drag-handle');
    if (!onHandle && e.target.closest('input,select,textarea,button,label')) return; // nu intru peste scris/butoane
    const startX = e.clientX, startY = e.clientY, pid = e.pointerId;
    const timer = setTimeout(() => { cleanupPre(); beginDrag(qb, pid); }, onHandle ? 0 : (e.pointerType === 'mouse' ? 160 : 420));
    const onMove = (ev) => { if (Math.hypot(ev.clientX - startX, ev.clientY - startY) > 10) cleanupPre(); }; // se misca = deruleaza/selecteaza, nu trage
    const onUp = () => cleanupPre();
    function cleanupPre() {
      clearTimeout(timer);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
      pre = null;
    }
    pre = cleanupPre;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
  });

  function beginDrag(qb, pid) {
    drag = { qb, pid, order: [...area.querySelectorAll('.qblock')] };
    qb.classList.add('dragging');
    document.body.classList.add('dragging-active');
    document.addEventListener('touchmove', blockScroll, { passive: false });
    window.addEventListener('pointermove', onDragMove);
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    try { qb.setPointerCapture(pid); } catch {}
  }
  function onDragMove(ev) {
    if (!drag || ev.pointerId !== drag.pid) return;
    const x = ev.clientX, y = ev.clientY;
    for (const t of area.querySelectorAll('.qblock')) {
      if (t === drag.qb) continue;
      const r = t.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const before = y < r.top + r.height / 2;
      if (before && drag.qb.nextElementSibling !== t) t.parentNode.insertBefore(drag.qb, t);
      else if (!before && t.nextElementSibling !== drag.qb) t.parentNode.insertBefore(drag.qb, t.nextElementSibling);
      break;
    }
  }
  function endDrag(ev) {
    if (!drag || (ev && ev.pointerId !== undefined && ev.pointerId !== drag.pid)) return;
    drag.qb.classList.remove('dragging');
    document.body.classList.remove('dragging-active');
    document.removeEventListener('touchmove', blockScroll, { passive: false });
    window.removeEventListener('pointermove', onDragMove);
    window.removeEventListener('pointerup', endDrag);
    window.removeEventListener('pointercancel', endDrag);
    // am schimbat ordinea? daca nu, nu facem nimic (un simplu click pe maner nu salveaza degeaba)
    const now = [...area.querySelectorAll('.qblock')];
    const changed = now.length !== drag.order.length || now.some((el, i) => el !== drag.order[i]);
    drag = null;
    if (changed) {
      renumber();
      if (typeof onReorder === 'function') onReorder(); // la editare: salvam noua ordine
    }
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
      <div class="qhead"><span class="drag-handle" title="Ține apăsat și trage ca să muți întrebarea">⠿</span><strong>Întrebarea ${i + 1}</strong><input type="text" class="qtitle" value="${esc(q.title)}" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" /><button type="button" class="icon-btn del-q">✕</button></div>
      <div class="opts">${q.options.map((o) => `<div class="opt-row"><input type="color" class="ocolor" value="${esc(o.color)}" /><input type="text" class="otext" value="${esc(o.text)}" autocomplete="off" data-lpignore="true" data-1p-ignore data-form-type="other" /><button type="button" class="icon-btn del-opt">−</button></div>`).join('')}</div>
      <button type="button" class="btn btn-ghost btn-small add-opt">+ Adaugă variantă</button></div>`).join('')}</div>
    <div class="row"><button class="btn btn-ghost btn-small" id="addQ">+ Adaugă întrebare oriunde</button>
    <button class="btn btn-primary" id="saveEdit">Salvează</button>
    <a class="btn btn-dark" href="#/controleaza/${s.id}" data-nav>Controlează live →</a></div>
  </section>`;
  // onReorder: dupa ce muti o intrebare (trage si elibereaza), noua ordine se salveaza imediat.
  wireForm('#qList', async () => {
    try { await api('/api/sessions/' + id, { method: 'PUT', body: JSON.stringify(collectForm()) }); toast('Ordine salvată ✓'); }
    catch (e) { toast(e.message); }
  });
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
  // Sesiunile închise nu mai sunt active: nu se mai arată aici, doar în Istoric.
  const active = mine.filter((s) => s.status !== 'closed');
  const closedCount = mine.length - active.length;
  app.innerHTML = `<section><h2>Sesiunile mele</h2>
  <p class="tiny muted">Aici apar sesiunile active (proiect sau live). Cele închise rămân în <a href="#/istoric" data-nav>Istoric</a>${closedCount ? ` (${closedCount} ${closedCount === 1 ? 'sesiune închisă' : 'sesiuni închise'})` : ''}.</p>
  ${active.length ? active.map((s) => `
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
    </div>`).join('') : '<div class="card">N-ai nicio sesiune activă. <a href="#/creeaza" data-nav>Creează prima →</a></div>'}
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
    <h2>Istoric sesiuni</h2>
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

  let lastIndex = s.currentIndex; // ca sa stim cand se schimba intrebarea curenta
  function paint() {
    // Pastram intrebarile extinse de administrator intre reimprospatarile automate.
    // (Altfel, la fiecare 2.5 secunde toate <details> se inchideau si pagina "sarea" la loc.)
    const prevOpen = new Set([...app.querySelectorAll('.tree details[open]')].map((d) => d.dataset.dkey));
    const firstPaint = !app.querySelector('.tree');
    if (lastIndex !== s.currentIndex) { prevOpen.add('root'); prevOpen.add('q' + s.currentIndex); lastIndex = s.currentIndex; }
    const openAttr = (key, fallback) => ((firstPaint ? fallback : prevOpen.has(key)) ? 'open' : '');
    const scrollY = window.scrollY;
    const ae = document.activeElement;
    const focusId = ae && ae.id ? ae.id : null;

    const cur = s.currentIndex >= 0 ? s.questions[s.currentIndex] : null;
    const isLast = s.questions.length > 0 && s.currentIndex === s.questions.length - 1;
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
          <p class="tiny muted">Apasă pe o întrebare ca să vezi variantele și câte voturi sunt. Întrebările extinse rămân extinse.</p>
          <div class="row tree-actions">
            <button class="btn btn-ghost btn-small btn-subtle" id="expandAll">Extinde toate întrebările</button>
            <button class="btn btn-ghost btn-small btn-subtle" id="collapseAll">Colapsează toate întrebările</button>
          </div>
          <details data-dkey="root" ${openAttr('root', true)}><summary>📁 ${esc(s.name)} (${s.questions.length} întrebări)</summary>
            <div style="padding:8px">
            ${s.questions.map((q, i) => `<details data-dkey="q${i}" ${openAttr('q' + i, i === s.currentIndex)}><summary class="${i === s.currentIndex ? 'live-q' : ''}">${i === s.currentIndex ? '▶ ' : ''}${i + 1}. ${esc(q.title)} (${q.total})</summary>
              <div class="tree-opts">${barsHTML(q)}<button class="btn btn-ghost btn-small" data-goto="${i}">Mergi la această întrebare</button></div></details>`).join('')}
            </div>
          </details>
        </div>
        <div>
          <div class="card current-card">
            ${s.status === 'draft' ? `<h3>Sesiunea e încă proiect.</h3><p>Apasă <strong>Pornește votul</strong> când ești gata. Votanții cu codul <strong>${esc(s.code)}</strong> așteaptă.</p>` : ''}
            ${cur ? `<p class="tiny muted">Întrebarea ${s.currentIndex + 1} din ${s.questions.length} • Total voturi aici: <strong>${cur.total}</strong> • Înregistrați: <strong>${s.registered}</strong></p>
            <p class="current-title">${esc(cur.title)}</p>${barsHTML(cur)}` : '<p>Nu există întrebare curentă.</p>'}
            <div class="row" style="margin-top:12px">
              ${s.status === 'draft' ? '<button class="btn btn-primary" id="cStart">▶ Pornește votul</button>' : ''}
              ${s.status === 'live' ? `<button class="btn btn-ghost btn-small" id="cPrev">← Precedenta</button>${isLast ? '' : '<button class="btn btn-primary btn-small" id="cNext">Următoarea →</button>'}<button class="btn btn-danger btn-small" id="cClose">■ Închide sesiunea</button>` : ''}
              <a class="btn btn-ghost btn-small" href="#/editeaza/${s.id}" data-nav>Editează întrebări</a>
            </div>
          </div>
          ${!isOwner ? '<p class="tiny muted">Vezi acest panou pentru că ești pe linkul de admin. Doar creatorul (' + esc(s.ownerEmail) + ') poate controla efectiv sesiunea.</p>' : ''}
        </div>
      </div>
    </section>`;
    // Punem pagina exact unde era (nu sare la inceput la reimprospatarea automata)
    if (focusId && $('#' + focusId)) { try { $('#' + focusId).focus({ preventScroll: true }); } catch {} }
    if (scrollY) window.scrollTo(0, scrollY);
    $('#copyCode').onclick = () => { navigator.clipboard.writeText(s.code); toast('Cod copiat'); };
    $('#copyLink').onclick = () => { navigator.clipboard.writeText(location.origin + location.pathname + '#/voteaza?cod=' + s.code); toast('Link copiat'); };
    const ctl = async (body) => { try { s = await api('/api/sessions/' + id + '/control', { method: 'POST', body: JSON.stringify(body) }); paint(); } catch (e) { toast(e.message); } };
    if ($('#cStart')) $('#cStart').onclick = () => ctl({ action: 'start' });
    if ($('#cNext')) $('#cNext').onclick = () => ctl({ action: 'next' });
    if ($('#cPrev')) $('#cPrev').onclick = () => ctl({ action: 'prev' });
    if ($('#cClose')) $('#cClose').onclick = () => ctl({ action: 'close' });
    app.querySelectorAll('[data-goto]').forEach((b) => (b.onclick = () => ctl({ action: 'goto', index: Number(b.dataset.goto) })));
    // cele doua butoane discrete: extinde / colapseaza toate intrebarile
    const setAll = (open) => app.querySelectorAll('.tree details').forEach((d) => { d.open = open; });
    if ($('#expandAll')) $('#expandAll').onclick = () => setAll(true);
    if ($('#collapseAll')) $('#collapseAll').onclick = () => setAll(false);
  }
  paint();
  stopPoll();
  pollTimer = setInterval(refresh, 2500);
}

// ---------- Login / header / cont ----------
function refreshHeader() {
  const u = getUser();
  const badge = $('#userBadge');
  badge.hidden = !u;
  if (u) {
    badge.innerHTML = `👤 ${esc(u.name)} • ${esc(u.email)}`;
    badge.title = 'Contul meu';
  }
  // Butonul "Intră cu email" se vede doar cand NU esti logat.
  // ("Ieși" a fost scos — deconectarea se face din fereastra Contul meu.)
  $('#loginBtn').hidden = !!u;
}

// Modalul de login: folosim SI atributul `hidden` (cu regula [hidden] din CSS)
// SI `style.display` direct — asa modalul se inchide corect chiar daca browserul
// are o versiune veche de styles.css in cache.
function openLoginModal() {
  const m = $('#loginModal');
  const pass = $('#loginPass'); if (pass) pass.value = '';
  m.hidden = false; m.style.display = 'flex';
  setTimeout(() => { const el = $('#loginName'); if (el) el.focus(); }, 0);
}
function closeLoginModal() {
  const m = $('#loginModal');
  m.hidden = true; m.style.display = 'none';
}

// Fereastra "Contul meu" — apare cand apesi pe numele/emailul din bara de sus.
function openAccountModal() {
  const u = getUser();
  if (!u) return;
  $('#accName').textContent = u.name || '—';
  $('#accEmail').textContent = u.email || '—';
  const m = $('#accountModal');
  m.hidden = false; m.style.display = 'flex';
}
function closeAccountModal() {
  const m = $('#accountModal');
  m.hidden = true; m.style.display = 'none';
}

function logoutLocal() {
  localStorage.removeItem('cabanavot_token');
  localStorage.removeItem('cabanavot_user');
  refreshHeader();
}

$('#loginBtn').onclick = openLoginModal;
$('#userBadge').onclick = openAccountModal;
$('#accClose').onclick = closeAccountModal;
$('#accountModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeAccountModal(); });
$('#accLogout').onclick = () => {
  logoutLocal(); closeAccountModal(); toast('Te-ai deconectat.'); route();
};
$('#accSwitch').onclick = () => {
  logoutLocal(); closeAccountModal(); route(); openLoginModal(); // intri din nou, cu alt cont
};
$('#closeLogin').onclick = closeLoginModal;
// Click pe fundalul întunecat (în afara căsuței) închide modalul
$('#loginModal').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeLoginModal(); });
// Enter în oricare câmp = apasă pe „Intră”
['loginName', 'loginEmail', 'loginPass'].forEach((id) => {
  $('#' + id).addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#doLogin').click(); });
});
$('#doLogin').onclick = async () => {
  const btn = $('#doLogin');
  const email = $('#loginEmail').value.trim();
  const name = $('#loginName').value.trim();
  const password = $('#loginPass').value;
  if (!email || !email.includes('@')) return toast('Scrie o adresă de email validă.');
  if (!name) return toast('Scrie și numele tău.');
  if (password.length < 6) return toast('Parola trebuie să aibă cel puțin 6 caractere.');
  btn.disabled = true; const label = btn.textContent; btn.textContent = 'Se conectează…';
  try {
    const r = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, name, password }) });
    localStorage.setItem('cabanavot_token', r.token);
    localStorage.setItem('cabanavot_user', JSON.stringify(r.user));
    closeLoginModal();
    refreshHeader();
    toast(r.created ? 'Cont creat! Bun venit, ' + r.user.name + '!'
      : r.passwordSet ? 'Parolă setată. Bun venit, ' + r.user.name + '!'
      : 'Bun venit înapoi, ' + r.user.name + '!');
    // Primul lucru după login: pagina de pornire „Bine ai venit la AG".
    if (location.hash !== '#/') location.hash = '#/';
    else route();
  } catch (e) { toast(e.message); }
  finally { btn.disabled = false; btn.textContent = label; const p = $('#loginPass'); if (p) p.value = ''; }
};
$('#hamburger').onclick = () => $('#mainNav').classList.toggle('open');

refreshHeader();
closeLoginModal(); // plasă de siguranță: modalurile pornesc închise chiar dacă CSS-ul e încă în cache
closeAccountModal();
route();
