/* ──────────────────────────────────────────────────────────────────────────
   store.js — one data layer with two back ends:
   • Demo mode: everything is saved in this browser only (localStorage).
   • Firebase mode: the lab's own Firebase project (Auth + Firestore + Storage).
   The rest of the app only talks to the functions returned here.
   ────────────────────────────────────────────────────────────────────────── */

const COLLECTIONS = ['meta', 'members', 'invites', 'modules', 'records', 'experiments', 'projects', 'log'];

function cleanForSave(data) {
  // JSON round-trip drops undefined values and copies data owned by other windows.
  return JSON.parse(JSON.stringify(data ?? {}));
}

async function createStore(config) {
  if (config && config.firebase && config.firebase.apiKey) return createFirebaseStore(config.firebase);
  return createDemoStore();
}

/* ── Demo store ─────────────────────────────────────────────────────────── */
function createDemoStore() {
  const KEY = 'labinv-modular-demo-v1';
  const USER_KEY = 'labinv-modular-demo-user';
  let db = {};
  try { db = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (_) { db = {}; }
  const watchers = {};
  let authCb = null;

  const persist = () => {
    try { localStorage.setItem(KEY, JSON.stringify(db)); }
    catch (_) { throw new Error('This browser has no space left for demo data. Remove some attachments or reset the demo.'); }
  };
  const list = col => Object.entries(db[col] || {}).map(([id, d]) => ({ ...cleanForSave(d), id }));
  const emit = col => (watchers[col] || []).forEach(cb => cb(list(col)));
  const apply = ops => {
    const touched = new Set();
    ops.forEach(([op, col, id, data]) => {
      db[col] = db[col] || {};
      if (op === 'set') db[col][id] = cleanForSave(data);
      else if (op === 'merge') db[col][id] = { ...(db[col][id] || {}), ...cleanForSave(data) };
      else if (op === 'del') delete db[col][id];
      touched.add(col);
    });
    persist();
    touched.forEach(emit);
  };
  const currentUser = () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch (_) { return null; }
  };

  return {
    mode: 'demo',
    hasFileStorage: false,
    maxEmbeddedFile: 300 * 1024,
    onAuth(cb) { authCb = cb; setTimeout(() => cb(currentUser()), 0); },
    async signInDemo(name) {
      const user = { uid: 'demo-' + keyFromLabel(name, []), email: '', name, emailVerified: true };
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      authCb && authCb(user);
    },
    async signOut() { localStorage.removeItem(USER_KEY); authCb && authCb(null); },
    watch(col, cb) {
      (watchers[col] = watchers[col] || []).push(cb);
      setTimeout(() => cb(list(col)), 0);
      return () => { watchers[col] = (watchers[col] || []).filter(x => x !== cb); };
    },
    async get(col, id) { const d = db[col]?.[id]; return d ? { ...cleanForSave(d), id } : null; },
    async put(col, id, data) { apply([['set', col, id, data]]); },
    async patch(col, id, data) { apply([['merge', col, id, data]]); },
    async del(col, id) { apply([['del', col, id]]); },
    async batch(ops) { apply(ops); },
    async transact(fn) {
      const ops = [];
      const tx = {
        get: async (col, id) => { const d = db[col]?.[id]; return d ? { ...cleanForSave(d), id } : null; },
        set: (col, id, data) => ops.push(['set', col, id, data]),
        del: (col, id) => ops.push(['del', col, id])
      };
      const result = await fn(tx);
      apply(ops);
      return result;
    },
    async upload() { throw new Error('File storage is not available in demo mode.'); },
    async removeFile() {},
    resetDemo() { localStorage.removeItem(KEY); localStorage.removeItem(USER_KEY); location.reload(); }
  };
}

/* ── Firebase store ─────────────────────────────────────────────────────── */
async function createFirebaseStore(cfg) {
  const base = 'https://www.gstatic.com/firebasejs/10.12.0/';
  const [appM, authM, fs, st] = await Promise.all([
    import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'),
    import(base + 'firebase-firestore.js'), import(base + 'firebase-storage.js')
  ]);
  const app = appM.initializeApp(cfg);
  const auth = authM.getAuth(app);
  const db = fs.getFirestore(app);
  let storage = null;
  try { if (cfg.storageBucket) storage = st.getStorage(app); } catch (_) { storage = null; }
  const { doc, collection, onSnapshot, setDoc, getDoc, deleteDoc, runTransaction, writeBatch } = fs;
  const toUser = u => u ? {
    uid: u.uid, email: String(u.email || '').toLowerCase(),
    name: u.displayName || u.email || 'User', emailVerified: !!u.emailVerified
  } : null;

  return {
    mode: 'firebase',
    hasFileStorage: !!storage,
    maxEmbeddedFile: 700 * 1024,
    onAuth(cb) { authM.onAuthStateChanged(auth, u => cb(toUser(u))); },
    signIn: (email, pw) => authM.signInWithEmailAndPassword(auth, email, pw),
    async signUp(name, email, pw) {
      const cred = await authM.createUserWithEmailAndPassword(auth, email, pw);
      await authM.updateProfile(cred.user, { displayName: name });
      try { await authM.sendEmailVerification(cred.user); } catch (_) {}
      return toUser(auth.currentUser);
    },
    resetPassword: email => authM.sendPasswordResetEmail(auth, email),
    sendVerification: () => authM.sendEmailVerification(auth.currentUser),
    async reloadUser() {
      await auth.currentUser.reload();
      await auth.currentUser.getIdToken(true); // refresh so the rules see email_verified
      return toUser(auth.currentUser);
    },
    signOut: () => authM.signOut(auth),
    watch(col, cb, onError) {
      return onSnapshot(collection(db, col),
        snap => cb(snap.docs.map(d => ({ ...d.data(), id: d.id }))),
        err => { console.warn('Listener failed for', col, err); onError && onError(err); });
    },
    async get(col, id) { const s = await getDoc(doc(db, col, id)); return s.exists() ? { ...s.data(), id: s.id } : null; },
    put: (col, id, data) => setDoc(doc(db, col, id), cleanForSave(data)),
    patch: (col, id, data) => setDoc(doc(db, col, id), cleanForSave(data), { merge: true }),
    del: (col, id) => deleteDoc(doc(db, col, id)),
    async batch(ops) {
      for (let i = 0; i < ops.length; i += 400) {
        const b = writeBatch(db);
        ops.slice(i, i + 400).forEach(([op, col, id, data]) => {
          const ref = doc(db, col, id);
          if (op === 'set') b.set(ref, cleanForSave(data));
          else if (op === 'merge') b.set(ref, cleanForSave(data), { merge: true });
          else if (op === 'del') b.delete(ref);
        });
        await b.commit();
      }
    },
    transact(fn) {
      return runTransaction(db, t => fn({
        get: async (col, id) => { const s = await t.get(doc(db, col, id)); return s.exists() ? { ...s.data(), id } : null; },
        set: (col, id, data) => t.set(doc(db, col, id), cleanForSave(data)),
        del: (col, id) => t.delete(doc(db, col, id))
      }));
    },
    async upload(file, path) {
      if (!storage) throw new Error('Firebase Storage is not configured.');
      const ref = st.ref(storage, path);
      await st.uploadBytes(ref, file, { contentType: file.type || 'application/octet-stream' });
      return { url: await st.getDownloadURL(ref), path };
    },
    async removeFile(path) {
      if (!storage || !path) return;
      try { await st.deleteObject(st.ref(storage, path)); } catch (_) { /* already gone */ }
    }
  };
}
