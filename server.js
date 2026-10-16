// CabanaVot — server backend real
// Ruleaza cu: npm install && npm start
// Explica pe inteles de incepator (vezi README.md):
// - acest fisier este "creierul": tine minte utilizatorii, sesiunile de vot si voturile
// - salveaza totul in db.json (un fisier text, tine loc de baza de date simpla)
// - serveste site-ul din folderul /public si ofera un API (/api/...) pentru frontend

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'db.json');

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------- Baza de date foarte simpla (fisier JSON) ----------
// De ce JSON si nu o baza de date adevarata?
// Pentru un incepator e mult mai simplu: nu trebuie sa instalezi nimic (MySQL/Postgres),
// vezi datele cu ochii tai in db.json, iar pentru cateva sute de votanti e suficient.
// Cand cresti mare, poti trece pe SQLite/Postgres fara sa schimbi API-ul.
function loadDb() {
  try {
    if (!fs.existsSync(DB_FILE)) {
      const fresh = { users: [], sessions: [] };
      fs.writeFileSync(DB_FILE, JSON.stringify(fresh, null, 2));
      return fresh;
    }
    const raw = fs.readFileSync(DB_FILE, 'utf8');
    const db = JSON.parse(raw);
    if (!db.users) db.users = [];
    if (!db.sessions) db.sessions = [];
    return db;
  } catch (e) {
    console.error('Eroare la citirea db.json, pornesc cu baza goala:', e.message);
    return { users: [], sessions: [] };
  }
}

function saveDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

let db = loadDb();

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : crypto.randomBytes(16).toString('hex');
}

// Cod de acces pentru votanti: 6 caractere usor de dictat (fara 0/O, 1/I)
function genCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
    if (!db.sessions.find((s) => s.code === code)) return code;
  }
  return crypto.randomBytes(3).toString('hex').toUpperCase();
}

function quorumNeeded(session) {
  if (!session.quorumEnabled || !session.totalEligible) return null;
  return Math.ceil((Number(session.totalEligible) * 2) / 3);
}

// Auth simpla pe baza de email (fara parola) — aleasa de tine.
// Cum functioneaza: introduci email + nume -> serverul iti da un token secret,
// browserul il tine minte. Doar cu tokenul tau poti edita sesiunile create de tine.
// ATENTIE: e simplu si bun pentru cercetasii Cabana, dar nu e la fel de sigur ca
// o parola. Oricine iti fura tokenul din browser iti poate edita voturile.
// Pentru voturi oficiale importante, treci pe varianta email+parola (vezi README).
function getUserFromReq(req) {
  const token = req.headers['x-auth-token'] || (req.headers.authorization || '').replace('Bearer ', '');
  if (!token) return null;
  return db.users.find((u) => u.token === token) || null;
}

function requireAuth(req, res, next) {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Trebuie sa fii logat cu email ca sa creezi/editezi voturi.' });
  req.user = user;
  next();
}

function countsFor(session) {
  // intoarce { [questionId]: { total: n, perOption: [n,n,...] } }
  const out = {};
  for (const q of session.questions) {
    out[q.id] = { total: 0, perOption: q.options.map(() => 0) };
  }
  for (const v of session.votes || []) {
    const entry = out[v.questionId];
    if (!entry) continue;
    if (v.optionIndex >= 0 && v.optionIndex < entry.perOption.length) {
      entry.perOption[v.optionIndex]++;
      entry.total++;
    }
  }
  return out;
}

function registeredCount(session) {
  // persoane "inregistrate in vot" = votanti unici care au intrat sau au votat cel putin o data
  const set = new Set([...(session.participants || []), ...((session.votes || []).map((v) => v.voterId))]);
  return set.size;
}

function publicSummary(session) {
  const counts = countsFor(session);
  const registered = registeredCount(session);
  return {
    id: session.id,
    code: session.code,
    name: session.name,
    status: session.status,
    createdAt: session.createdAt,
    ownerEmail: session.ownerEmail,
    quorumEnabled: !!session.quorumEnabled,
    totalEligible: session.totalEligible || null,
    quorumNeeded: quorumNeeded(session),
    registered,
    quorumMet: quorumNeeded(session) != null ? registered >= quorumNeeded(session) : null,
    questionsCount: session.questions.length,
    totalVotes: (session.votes || []).length,
    currentIndex: session.currentIndex,
    questions: session.questions.map((q) => ({
      id: q.id,
      title: q.title,
      options: q.options.map((o, i) => ({
        text: o.text,
        color: o.color,
        votes: (counts[q.id] ? counts[q.id].perOption[i] : 0),
      })),
      total: counts[q.id] ? counts[q.id].total : 0,
    })),
  };
}

// ---------- API ----------

app.get('/api/health', (req, res) => res.json({ ok: true, app: 'CabanaVot', time: new Date().toISOString() }));

// Login simplu: { email, name }
app.post('/api/auth/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const name = String(req.body.name || '').trim();
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Scrie o adresa de email valida.' });
  if (!name) return res.status(400).json({ error: 'Scrie si numele tau.' });
  let user = db.users.find((u) => u.email === email);
  if (!user) {
    user = { id: uid(), email, name, token: uid() + uid().replace(/-/g, ''), createdAt: new Date().toISOString() };
    db.users.push(user);
  } else {
    user.name = name; // actualizeaza numele
  }
  saveDb(db);
  res.json({ token: user.token, user: { id: user.id, email: user.email, name: user.name } });
});

app.get('/api/me', (req, res) => {
  const user = getUserFromReq(req);
  if (!user) return res.status(401).json({ error: 'Neautentificat' });
  res.json({ id: user.id, email: user.email, name: user.name });
});

// Istoric: toate sesiunile (public, pentru transparenta)
app.get('/api/sessions', (req, res) => {
  const list = [...db.sessions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(publicSummary);
  res.json(list);
});

// Sesiunile mele (doar ale contului logat)
app.get('/api/sessions/mine', requireAuth, (req, res) => {
  const mine = db.sessions
    .filter((s) => s.ownerId === req.user.id)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(publicSummary);
  res.json(mine);
});

// Creeaza sesiune de vot (doar logat). Genereaza automat codul pentru votanti.
app.post('/api/sessions', requireAuth, (req, res) => {
  const name = String(req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Sesiunea trebuie sa aiba un nume (ex: AG primavara 2026).' });

  const quorumEnabled = !!req.body.quorumEnabled;
  const totalEligible = quorumEnabled ? Number(req.body.totalEligible) : null;
  if (quorumEnabled && (!totalEligible || totalEligible < 1)) {
    return res.status(400).json({ error: 'Daca bifezi cvorum 2/3, scrie cate persoane au drept de vot.' });
  }

  const rawQuestions = Array.isArray(req.body.questions) ? req.body.questions : [];
  if (rawQuestions.length === 0) return res.status(400).json({ error: 'Adauga cel putin o intrebare.' });

  const questions = [];
  for (const rq of rawQuestions) {
    const title = String(rq.title || '').trim();
    if (!title) continue;
    const opts = (rq.options || []).map((o) => ({
      text: String(o.text || '').trim(),
      color: String(o.color || '#0099FF'),
    })).filter((o) => o.text);
    if (opts.length < 2) return res.status(400).json({ error: `Intrebarea "${title}" trebuie sa aiba cel putin 2 variante de raspuns.` });
    questions.push({ id: uid(), title, options: opts });
  }
  if (!questions.length) return res.status(400).json({ error: 'Adauga cel putin o intrebare valida.' });

  const session = {
    id: uid(),
    code: genCode(),
    name,
    ownerId: req.user.id,
    ownerEmail: req.user.email,
    createdAt: new Date().toISOString(),
    status: 'draft', // draft -> live -> closed
    currentIndex: -1,
    quorumEnabled,
    totalEligible,
    questions,
    votes: [],
    participants: [],
  };
  db.sessions.push(session);
  saveDb(db);
  res.json(publicSummary(session));
});

// Detaliu sesiune (public pentru istoric + votanti, complet pentru owner)
app.get('/api/sessions/:id', (req, res) => {
  const s = db.sessions.find((x) => x.id === req.params.id || x.code === String(req.params.id).toUpperCase());
  if (!s) return res.status(404).json({ error: 'Sesiunea nu a fost gasita.' });
  res.json(publicSummary(s));
});

// Editeaza sesiune (DOAR creatorul). Poti edita si in timp ce e live,
// inclusiv sa inserezi o intrebare noua oriunde in ordine.
app.put('/api/sessions/:id', requireAuth, (req, res) => {
  const s = db.sessions.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Sesiunea nu a fost gasita.' });
  if (s.ownerId !== req.user.id) return res.status(403).json({ error: 'Doar persoana care a creat votul poate modifica intrebarile.' });

  if (req.body.name != null) {
    const name = String(req.body.name).trim();
    if (!name) return res.status(400).json({ error: 'Numele sesiunii nu poate fi gol.' });
    s.name = name;
  }
  if (req.body.quorumEnabled != null) s.quorumEnabled = !!req.body.quorumEnabled;
  if (req.body.totalEligible != null) s.totalEligible = Number(req.body.totalEligible) || null;

  if (Array.isArray(req.body.questions)) {
    // pastram voturile pentru intrebarile existente (dupa id)
    const nextQuestions = [];
    for (const rq of req.body.questions) {
      const title = String(rq.title || '').trim();
      if (!title) continue;
      const opts = (rq.options || []).map((o) => ({
        text: String(o.text || '').trim(),
        color: String(o.color || '#0099FF'),
      })).filter((o) => o.text);
      if (opts.length < 2) return res.status(400).json({ error: `Intrebarea "${title}" trebuie sa aiba cel putin 2 variante.` });
      const existing = s.questions.find((q) => q.id === rq.id);
      nextQuestions.push({ id: existing ? existing.id : uid(), title, options: opts });
    }
    if (!nextQuestions.length) return res.status(400).json({ error: 'Sesiunea trebuie sa aiba cel putin o intrebare.' });
    // curata voturile pentru intrebari sterse
    const validIds = new Set(nextQuestions.map((q) => q.id));
    s.votes = (s.votes || []).filter((v) => validIds.has(v.questionId));
    // daca optiunile s-au micsorat, curata voturile invalide
    const byId = Object.fromEntries(nextQuestions.map((q) => [q.id, q]));
    s.votes = s.votes.filter((v) => v.optionIndex < byId[v.questionId].options.length);
    s.questions = nextQuestions;
    if (s.currentIndex >= s.questions.length) s.currentIndex = s.questions.length - 1;
  }
  saveDb(db);
  res.json(publicSummary(s));
});

app.delete('/api/sessions/:id', requireAuth, (req, res) => {
  const idx = db.sessions.findIndex((x) => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Sesiunea nu a fost gasita.' });
  if (db.sessions[idx].ownerId !== req.user.id) return res.status(403).json({ error: 'Doar creatorul poate sterge sesiunea.' });
  db.sessions.splice(idx, 1);
  saveDb(db);
  res.json({ ok: true });
});

// Control live (doar owner): start / next / prev / goto / close / reopen
app.post('/api/sessions/:id/control', requireAuth, (req, res) => {
  const s = db.sessions.find((x) => x.id === req.params.id);
  if (!s) return res.status(404).json({ error: 'Sesiunea nu a fost gasita.' });
  if (s.ownerId !== req.user.id) return res.status(403).json({ error: 'Doar administratorul votului poate controla sesiunea.' });
  const action = req.body.action;
  if (action === 'start') {
    if (!s.questions.length) return res.status(400).json({ error: 'Adauga intrebari inainte sa pornesti.' });
    s.status = 'live';
    s.currentIndex = 0;
  } else if (action === 'next') {
    if (s.currentIndex < s.questions.length - 1) s.currentIndex++;
  } else if (action === 'prev') {
    if (s.currentIndex > 0) s.currentIndex--;
  } else if (action === 'goto') {
    const i = Number(req.body.index);
    if (!Number.isInteger(i) || i < 0 || i >= s.questions.length) return res.status(400).json({ error: 'Index invalid.' });
    s.status = 'live';
    s.currentIndex = i;
  } else if (action === 'close') {
    s.status = 'closed';
  } else if (action === 'reopen') {
    s.status = 'live';
    if (s.currentIndex < 0) s.currentIndex = 0;
  } else {
    return res.status(400).json({ error: 'Actiune necunoscuta.' });
  }
  saveDb(db);
  res.json(publicSummary(s));
});

// ---------- Partea votantului (FARA cont, doar cu cod) ----------

// Informatii pentru votant dupa cod
app.get('/api/join/:code', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const s = db.sessions.find((x) => x.code === code);
  if (!s) return res.status(404).json({ error: 'Codul nu exista. Verifica-l cu administratorul.' });
  const voterId = String(req.query.voterId || '');
  const counts = countsFor(s);
  const currentQ = s.status === 'live' && s.currentIndex >= 0 ? s.questions[s.currentIndex] : null;
  let myVote = null;
  if (currentQ && voterId) {
    const v = (s.votes || []).find((x) => x.questionId === currentQ.id && x.voterId === voterId);
    if (v) myVote = v.optionIndex;
  }
  res.json({
    code: s.code,
    name: s.name,
    status: s.status,
    questionsCount: s.questions.length,
    currentIndex: s.currentIndex,
    quorumEnabled: !!s.quorumEnabled,
    quorumNeeded: quorumNeeded(s),
    registered: registeredCount(s),
    current: currentQ ? {
      id: currentQ.id,
      title: currentQ.title,
      options: currentQ.options.map((o) => ({ text: o.text, color: o.color })),
      total: counts[currentQ.id] ? counts[currentQ.id].total : 0,
      myVote,
    } : null,
  });
});

// Inregistrare prezenta (pentru cvorum) — nu e vot, doar "sunt aici"
app.post('/api/join/:code/register', (req, res) => {
  const code = String(req.params.code || '').trim().toUpperCase();
  const s = db.sessions.find((x) => x.code === code);
  if (!s) return res.status(404).json({ error: 'Cod invalid.' });
  const voterId = String(req.body.voterId || '').trim();
  if (!voterId) return res.status(400).json({ error: 'Lipseste identificatorul anonim.' });
  s.participants = s.participants || [];
  if (!s.participants.includes(voterId)) s.participants.push(voterId);
  saveDb(db);
  res.json({ registered: registeredCount(s), quorumNeeded: quorumNeeded(s) });
});

// Voteaza: anonim (se retine doar un id aleatoriu, nu numele/emailul)
app.post('/api/vote', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const questionId = String(req.body.questionId || '');
  const optionIndex = Number(req.body.optionIndex);
  const voterId = String(req.body.voterId || '').trim();
  if (!code || !questionId || !voterId) return res.status(400).json({ error: 'Date incomplete.' });
  if (!Number.isInteger(optionIndex)) return res.status(400).json({ error: 'Varianta invalida.' });

  const s = db.sessions.find((x) => x.code === code);
  if (!s) return res.status(404).json({ error: 'Cod invalid.' });
  if (s.status !== 'live') return res.status(400).json({ error: 'Votul nu este pornit momentan. Asteapta administratorul.' });

  const currentQ = s.questions[s.currentIndex];
  if (!currentQ || currentQ.id !== questionId) {
    return res.status(400).json({ error: 'Poti vota doar intrebarea curenta aleasa de administrator.' });
  }
  if (optionIndex < 0 || optionIndex >= currentQ.options.length) return res.status(400).json({ error: 'Varianta invalida.' });

  s.votes = s.votes || [];
  s.participants = s.participants || [];
  if (!s.participants.includes(voterId)) s.participants.push(voterId);

  const existing = s.votes.find((v) => v.questionId === questionId && v.voterId === voterId);
  if (existing) {
    existing.optionIndex = optionIndex; // permitem schimbarea votului cat intrebarea e activa
  } else {
    s.votes.push({ questionId, voterId, optionIndex, at: new Date().toISOString() });
  }
  saveDb(db);
  const counts = countsFor(s);
  res.json({ ok: true, total: counts[questionId].total });
});

// Rezultate detaliate (adminul le vede live; istoricul e public dupa inchidere)
app.get('/api/sessions/:id/results', (req, res) => {
  const s = db.sessions.find((x) => x.id === req.params.id || x.code === String(req.params.id).toUpperCase());
  if (!s) return res.status(404).json({ error: 'Sesiunea nu a fost gasita.' });
  res.json(publicSummary(s));
});

// Fallback SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`CabanaVot ruleaza pe http://localhost:${PORT}`);
});
