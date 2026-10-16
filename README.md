# CabanaVot — platforma de vot Cabana Scout

Platformă de vot anonim, live, model inspirat de voxvote.com,
cu design după Manualul de identitate vizuală Cabana Scout v3.0
(albastru `#0099FF`, bej `#D1C885`, mov închis `#000080`, font Red Hat Display).

## Ce face (conform indicațiilor tale)

- ✅ Oricine poate crea un vot, dar **doar creatorul poate modifica** întrebările/variantele.
- ✅ Ca să creezi un vot trebuie să fii **logat cu email** (variantă simplă, fără parolă) — se salvează istoricul pe cont.
- ✅ Votantul **nu are nevoie de cont**, doar de **codul generat automat** (6 caractere).
- ✅ Voturi **anonime** (serverul ține minte doar un id aleatoriu, nu cine ce a votat).
- ✅ **Istoric cu toate sesiunile** (ex: „AG primăvara 2026"), extensibil: sesiune → întrebări → variante + voturi.
- ✅ **Cvorum 2/3 opțional**: bifezi căsuța, scrii câte persoane au drept de vot, site-ul calculează `ceil(total × 2/3)`. E doar o **indicație**, votul pornește oricum.
- ✅ Administratorul **vede live câte persoane au votat fiecare variantă**.
- ✅ Administratorul **creează sesiunea când vrea, o pornește când vrea, trece de la o întrebare la alta** (Start / Precedenta / Următoarea / salt direct) și **poate adăuga o întrebare nouă live, oriunde în ordine**, din meniul unde vede toată sesiunea.
- ✅ La fiecare variantă poți pune **culoare diferită**, iar bara de rezultate se colorează cu ea, proporțional cu voturile.

## Structura (pe înțeles de începător)

Gândește-te la aplicație ca la o cabană cu două părți:

1. **`public/` = partea vizibilă (frontend)** — ce vede lumea în browser: `index.html` (scheletul), `styles.css` (culorile frumoase), `app.js` (butoanele, votul live).
2. **`server.js` = creierul (backend)** — ține minte utilizatorii, sesiunile și voturile, dă codurile, verifică că doar creatorul editează. Salvează totul în **`db.json`** (un fișier text care ține loc de bază de date simplă).
3. **`package.json`** = lista de „unelte” necesare (Express + CORS). E ca o listă de cumpărături pentru server.

De ce backend real și nu doar un fișier HTML?
- Doar-HTML = votul ar funcționa doar pe laptopul tău. Telefoanele votanților n-ar putea trimite voturile la tine.
- Cu backend = telefoanele trimit voturile prin internet la server, iar administratorul vede totul live. De asta ai nevoie de un server pornit + un link public.

## Cum rulezi pe calculatorul tău (test local)

Ai nevoie de **Node.js 18+** instalat (o singură dată de pe https://nodejs.org).

```bash
cd CabanaVot
npm install
npm start
```

Deschide apoi http://localhost:3000

## Cum o faci PUBLICĂ (s-o acceseze oricine) — varianta cea mai simplă: Render.com (gratuit)

1. Fă-ți cont pe https://github.com și urcă folderul `CabanaVot` într-un repository nou (poți trage fișierele direct în pagina GitHub → Add file → Upload).
2. Fă-ți cont pe https://render.com (te loghezi cu GitHub).
3. În Render: **New → Web Service → conectezi repository-ul CabanaVot**.
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free.
4. Apasă Deploy. Primești un link de forma `https://cabanavot.onrender.com` — ăsta e linkul public, îl trimiți oricui.

Alternativ: Railway.app, Fly.io sau un VPS — pașii sunt aceiași (Build `npm install`, Start `npm start`, portul îl alege platforma prin variabila `PORT`).

> Notă: pe planul gratuit Render, serverul „adoarme" după inactivitate și pornește mai greu la primul acces (~30s). Pentru AG-uri importante, ia planul Starter (~7$/lună) sau ține un tab deschis înainte de vot.

## Fluxul de vot la un eveniment real

1. Administratorul: Intră cu email → Creează vot → primește codul (ex: `K7P2QX`) → apasă **Controlează live → Pornește votul**.
2. Proiectează pe ecran codul + linkul (butoanele „Copiază codul/linkul").
3. Votanții: intră pe linkul public → Votează cu cod → votează întrebarea curentă (fără cont).
4. Administratorul: vede barele colorate live → apasă Următoarea → la final Închide sesiunea → totul rămâne în Istoric.

## Limitări asumate (important să știi)

- Loginul e **simplu, fără parolă** (cum ai ales): oricine știe emailul tău NU îți poate fura sesiunile (trebuie tokenul din browserul tău), dar nici nu e securitate de nivel bancar. Pentru voturi statutare critice, următorul pas e email+parolă (pot adăuga).
- Baza de date e un fișier `db.json`: bun pentru zeci/sute de votanți. Fă backup din când în când (descarcă fișierul din server).
- Votul dublu e prevenit per browser (id anonim). Dacă cineva votează de pe 2 telefoane, contează dublu — ca la voxvote în varianta simplă. Pentru protecție avansată (listă nominală de alegători), trebuie modulul „alegători invitați".

## Comenzi utile

- `npm start` — pornește serverul
- fișierul `db.json` apare automat la prima pornire — nu-l șterge dacă vrei să păstrezi istoricul
