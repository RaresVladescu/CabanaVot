// CabanaVot — stocare in Netlify Blobs (productie).
// Totul sta intr-un singur blob JSON numit "db". Ca sa nu se piarda voturi
// cand doua persoane scriu in acelasi moment, folosim scriere conditionata
// (etag / onlyIfMatch) si reincercam daca altcineva a scris intre timp.

import { getStore } from '@netlify/blobs';

const KEY = 'db';
const MAX_ATTEMPTS = 40;

function empty() {
  return { users: [], sessions: [] };
}

function normalize(db) {
  if (!db || typeof db !== 'object') db = {};
  if (!Array.isArray(db.users)) db.users = [];
  if (!Array.isArray(db.sessions)) db.sessions = [];
  return db;
}

export function createBlobsStore(name = 'cabanavot') {
  // "strong" = citirea vede imediat ultima scriere (altfel poate intarzia pana la 60s)
  const store = getStore({ name, consistency: 'strong' });

  async function read() {
    const entry = await store.getWithMetadata(KEY, { type: 'json' });
    if (!entry || entry.data == null) return { db: empty(), version: null };
    return { db: normalize(entry.data), version: entry.etag || null };
  }

  async function commit(db, version) {
    const options = version ? { onlyIfMatch: version } : { onlyIfNew: true };
    const result = await store.setJSON(KEY, db, options);
    return !!result.modified;
  }

  return {
    read,
    async mutate(fn) {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        const { db, version } = await read();
        const res = fn(db);
        if (res.changed === false) return res;
        if (await commit(db, version)) return res;
        // altcineva a scris intre timp: asteptam putin si reluam pe datele noi
        await new Promise((r) => setTimeout(r, 15 + Math.random() * 45));
      }
      throw new Error('Prea multe accesari simultane. Mai incearca o data.');
    },
  };
}
