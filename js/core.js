/* ──────────────────────────────────────────────────────────────────────────
   core.js — app state, helpers, dialogs, sign-in and lab setup, routing,
   sidebar, overview page and global search.
   ────────────────────────────────────────────────────────────────────────── */

const App = {
  config: window.LAB_CONFIG || {},
  store: null, user: null, member: null, lab: null,
  modules: [], records: [], experiments: [], projects: [], log: [], members: [], invites: [],
  unsub: [], route: { name: 'home' }, drawer: null, dirty: false, sel: {}, loaded: new Set()
};

/* ── Small helpers ──────────────────────────────────────────────────────── */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ACT = {}; // click actions: <button data-act="name">

function parseNum(value) {
  let raw = String(value ?? '').trim().replace(/[\s'’]/g, '');
  if (!raw) return NaN;
  const c = raw.lastIndexOf(','), d = raw.lastIndexOf('.');
  if (c >= 0 && d >= 0) {
    const dec = c > d ? ',' : '.';
    raw = raw.split(dec === ',' ? '.' : ',').join('');
    if (dec === ',') raw = raw.replace(',', '.');
  } else if (c >= 0) raw = raw.replace(',', '.');
  return Number(raw);
}
const fmtNum = n => Number.isFinite(Number(n)) ? Number(n).toLocaleString(undefined, { maximumFractionDigits: 4 }) : String(n ?? '');
const round4 = n => Math.round(Number(n) * 10000) / 10000;
function fmtDate(iso) {
  if (!iso) return '';
  const d = new Date(String(iso).length === 10 ? iso + 'T00:00:00' : iso);
  return isNaN(d) ? String(iso) : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}
const fmtTs = ms => ms ? new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
const todayIso = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
const daysUntil = iso => Math.round((new Date(iso + 'T00:00:00') - new Date(todayIso() + 'T00:00:00')) / 86400000);
const plural = (n, one, many) => `${fmtNum(n)} ${n === 1 ? one : (many || one + 's')}`;

/* Allow only simple formatting tags in user-written rich text (prevents scripts). */
function sanitizeHtml(html) {
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'H2', 'H3', 'H4',
    'BLOCKQUOTE', 'CODE', 'PRE', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD', 'SUB', 'SUP', 'A', 'SPAN']);
  const drop = new Set(['SCRIPT', 'STYLE', 'IFRAME', 'OBJECT', 'EMBED', 'LINK', 'META', 'FORM', 'INPUT', 'BUTTON', 'SVG', 'MATH', 'TEMPLATE']);
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const root = doc.body.firstElementChild;
  const walk = node => {
    [...node.children].forEach(el => {
      if (drop.has(el.tagName)) { el.remove(); return; }
      walk(el);
      if (!allowed.has(el.tagName)) { el.replaceWith(...el.childNodes); return; }
      const href = el.getAttribute('href');
      [...el.attributes].forEach(a => el.removeAttribute(a.name));
      if (el.tagName === 'A' && href && /^(https?:|mailto:)/i.test(href.trim())) {
        el.setAttribute('href', href.trim()); el.setAttribute('target', '_blank'); el.setAttribute('rel', 'noopener');
      }
    });
  };
  if (root) walk(root);
  return root ? root.innerHTML.trim() : '';
}
const htmlToText = html => { const d = document.createElement('div'); d.innerHTML = sanitizeHtml(html); return d.textContent.trim(); };
const safeUrl = u => /^(https?:|mailto:)/i.test(String(u || '').trim()) ? String(u).trim() : '';

/* ── Roles and lookups ──────────────────────────────────────────────────── */
const role = () => App.member?.role || 'viewer';
const isAdmin = () => role() === 'admin';
const canEdit = () => role() === 'admin' || role() === 'member';
const activeModules = () => App.modules.filter(m => !m.archived).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name));
const modById = id => App.modules.find(m => m.id === id) || null;
const recById = id => App.records.find(r => r.id === id) || null;
const recName = r => (r?.data?.name ?? '').toString().trim() || 'Untitled';
const recordsOf = moduleId => App.records.filter(r => r.moduleId === moduleId);
const visibleFields = mod => (mod?.fields || []).filter(f => !f.hidden);
const tape = color => TAPES[color] || TAPES.grey;
const me = () => App.user?.name || 'Unknown';

function tapeLabel(mod, small = false) {
  if (!mod) return '';
  const t = tape(mod.color);
  return `<span class="tape-label${small ? ' sm' : ''}" style="--tb:${t.bg};--tf:${t.fg}">${esc(mod.name)}</span>`;
}
function tapeDot(mod) { return `<span class="tape-dot" style="--tb:${tape(mod?.color).bg}"></span>`; }

/* Stock status of a record: none | ok | low | out. */
function stockState(rec, mod = modById(rec?.moduleId)) {
  const mode = mod?.stock?.mode || 'none';
  if (mode === 'none') return 'none';
  const qty = mode === 'parts' ? partsTotal(rec) : Number(rec.stock || 0);
  if (qty <= 0) return 'out';
  if (mode === 'single' && qty <= Number(rec.lowAt ?? mod.stock.lowAt ?? 0)) return 'low';
  return 'ok';
}
const partsTotal = rec => Object.values(rec?.parts || {}).reduce((s, n) => s + Number(n || 0), 0);
function stockBadge(state) {
  return state === 'out' ? '<span class="badge bad">Out of stock</span>'
    : state === 'low' ? '<span class="badge warn">Low stock</span>'
      : state === 'ok' ? '<span class="badge ok">In stock</span>' : '';
}
function recUnit(rec, mod = modById(rec?.moduleId)) { return rec?.unit || mod?.stock?.unit || ''; }

async function logChange(desc) {
  const id = Date.now() + '-' + Math.random().toString(36).slice(2, 7);
  try { await App.store.put('log', id, { ts: Date.now(), user: me(), uid: App.user?.uid || '', desc }); }
  catch (err) { console.warn('Activity log entry failed:', err); }
}

/* ── Toasts, modals, drawer ─────────────────────────────────────────────── */
function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.setAttribute('role', kind === 'bad' ? 'alert' : 'status');
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), kind === 'bad' ? 9000 : 2800);
  t.addEventListener('click', () => t.remove());
}
function errorMessage(err) {
  const code = err?.code || '';
  if (code.includes('permission-denied')) return 'You do not have permission for this action. Ask a lab admin to check your role.';
  if (code.includes('auth/invalid-credential') || code.includes('auth/wrong-password')) return 'The email or password is not correct.';
  if (code.includes('auth/email-already-in-use')) return 'An account with this email already exists. Sign in instead.';
  if (code.includes('auth/weak-password')) return 'Use a password with at least 6 characters.';
  if (code.includes('auth/invalid-email')) return 'Enter a valid email address.';
  if (code.includes('unavailable')) return 'No connection to the database. Check your internet connection.';
  return err?.message || String(err);
}

function openModal({ title, body, actions = [], wide = false, onClose }) {
  const root = $('#modalRoot');
  const wrap = document.createElement('div');
  wrap.className = 'modal-scrim';
  wrap.innerHTML = `<div class="modal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <header class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${ICON.x}</button></header>
      <div class="modal-body">${body}</div>
      ${actions.length ? `<footer class="modal-foot">${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-i="${i}">${esc(a.label)}</button>`).join('')}</footer>` : ''}
    </div>`;
  root.appendChild(wrap);
  const prevFocus = document.activeElement;
  const close = () => { wrap.remove(); document.removeEventListener('keydown', onKey); onClose && onClose(); prevFocus?.focus?.(); };
  const onKey = e => { if (e.key === 'Escape' && root.lastElementChild === wrap) close(); };
  document.addEventListener('keydown', onKey);
  wrap.addEventListener('mousedown', e => { if (e.target === wrap) close(); });
  $('[data-close]', wrap).addEventListener('click', close);
  $$('.modal-foot .btn', wrap).forEach(btn => btn.addEventListener('click', async () => {
    const a = actions[+btn.dataset.i];
    if (!a.onClick) return close();
    const label = btn.textContent;
    $$('.modal-foot .btn', wrap).forEach(b => b.disabled = true);
    try { const keepOpen = await a.onClick(close, wrap); if (keepOpen === true) $$('.modal-foot .btn', wrap).forEach(b => b.disabled = false); }
    catch (err) { console.error(err); toast(errorMessage(err), 'bad'); $$('.modal-foot .btn', wrap).forEach(b => b.disabled = false); btn.textContent = label; }
  }));
  setTimeout(() => ($('input,select,textarea', $('.modal-body', wrap)) || $('.modal-foot .btn:last-child', wrap) || $('[data-close]', wrap))?.focus(), 30);
  return { el: wrap, close };
}

function confirmDialog(title, message, { confirmText = 'Delete', danger = true } = {}) {
  return new Promise(resolve => {
    let done = false;
    openModal({
      title, body: `<p class="lead">${message}</p>`,
      onClose: () => { if (!done) resolve(false); },
      actions: [
        { label: 'Cancel', kind: 'ghost' },
        { label: confirmText, kind: danger ? 'danger' : 'primary', onClick: close => { done = true; close(); resolve(true); } }
      ]
    });
  });
}

function openDrawer(html) {
  const d = $('#drawer');
  $('.drawer-panel', d).innerHTML = html;
  d.hidden = false;
  requestAnimationFrame(() => d.classList.add('open'));
}
function closeDrawer() {
  const d = $('#drawer');
  if (App.drawer?.mode === 'edit' && App.drawerDirty && !confirm('Discard your unsaved changes?')) return;
  App.drawer = null; App.drawerDirty = false;
  d.classList.remove('open');
  setTimeout(() => { if (!App.drawer) { d.hidden = true; $('.drawer-panel', d).innerHTML = ''; } }, 180);
}
ACT.closeDrawer = () => closeDrawer();

/* ── Icons (inline, no external library) ────────────────────────────────── */
const svg = p => `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON = {
  x: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  home: svg('<path d="M4 11l8-7 8 7v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1z"/>'),
  flask: svg('<path d="M9 3h6M10 3v6l-5.5 9.5A1.7 1.7 0 0 0 6 21h12a1.7 1.7 0 0 0 1.5-2.5L14 9V3"/><path d="M7.5 15h9"/>'),
  folder: svg('<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>'),
  cart: svg('<path d="M3 4h2l2.5 11h11L21 7H6.2"/><circle cx="9" cy="19" r="1.4"/><circle cx="17" cy="19" r="1.4"/>'),
  blocks: svg('<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><path d="M17.5 14v7M14 17.5h7"/>'),
  people: svg('<circle cx="9" cy="8" r="3.2"/><path d="M3 20c.6-3.4 3-5.5 6-5.5s5.4 2.1 6 5.5"/><path d="M16 4.5a3 3 0 0 1 0 6M18 14.8c1.7.7 2.8 2.5 3 5.2"/>'),
  gear: svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  search: svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
  menu: svg('<path d="M4 7h16M4 12h16M4 17h16"/>'),
  up: svg('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: svg('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  print: svg('<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="1.5"/><path d="M7 14h10v7H7z"/>'),
  out: svg('<path d="M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H4"/>'),
  file: svg('<path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z"/><path d="M14 3v5h5"/>')
};

/* ── Boot, sign-in, lab setup ───────────────────────────────────────────── */
async function boot() {
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-act]');
    if (!t || t.disabled) return;
    const fn = ACT[t.dataset.act];
    if (!fn) return;
    if (t.tagName === 'A' || t.tagName === 'BUTTON') e.preventDefault();
    fn(t, e);
  });
  $('#drawer .drawer-scrim').addEventListener('click', closeDrawer);
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !$('#modalRoot').children.length && App.drawer) closeDrawer();
  });
  window.addEventListener('hashchange', onHashChange);
  window.addEventListener('beforeunload', e => { if (App.dirty || App.drawerDirty) { e.preventDefault(); e.returnValue = ''; } });
  try {
    App.store = await createStore(App.config);
  } catch (err) {
    console.error(err);
    showAuthScreen(`<h1>Could not connect</h1><p class="lead">The app could not load Firebase. Check the settings in <code>config.js</code> and your internet connection.</p><p class="muted small">${esc(err.message || err)}</p>`);
    return;
  }
  App.store.onAuth(onAuthChange);
}

function showAuthScreen(inner) {
  $('#boot').hidden = true; $('#app').hidden = true;
  const a = $('#auth');
  a.hidden = false;
  a.innerHTML = `<div class="auth-card">${inner}</div>
    <p class="auth-foot">${App.store?.mode === 'demo' ? 'Demo mode: data is saved in this browser only.' : esc(App.config.labName || '')}</p>`;
  setTimeout(() => $('input', a)?.focus(), 30);
}

function stopListeners() { App.unsub.forEach(u => { try { u(); } catch (_) { } }); App.unsub = []; App.loaded = new Set(); }

async function onAuthChange(user) {
  stopListeners();
  App.user = user; App.member = null; App.lab = null;
  if (!user) return showSignIn();
  try {
    App.lab = await App.store.get('meta', 'lab');
    if (!App.lab) return showSetup();
    App.member = await App.store.get('members', user.uid);
    if (!App.member && App.store.mode === 'demo') {
      App.member = { uid: user.uid, name: user.name, email: '', role: 'admin', joinedAt: Date.now() };
      await App.store.put('members', user.uid, App.member);
    }
    if (!App.member) {
      const invite = user.email ? await App.store.get('invites', user.email).catch(() => null) : null;
      if (!invite) return showNoAccess();
      if (!user.emailVerified) return showVerify();
      const member = { uid: user.uid, name: user.name, email: user.email, role: invite.role, joinedAt: Date.now() };
      await App.store.put('members', user.uid, member);
      App.member = member;
      await logChange(`${user.name} joined the lab as ${invite.role}`);
    }
    startApp();
  } catch (err) {
    console.error(err);
    showAuthScreen(`<h1>Something went wrong</h1><p class="lead">${esc(errorMessage(err))}</p>
      <div class="row"><button class="btn primary" data-act="reload">Try again</button><button class="btn ghost" data-act="signOut">Sign out</button></div>`);
  }
}
ACT.reload = () => location.reload();
ACT.signOut = async () => {
  if (App.dirty && !confirm('Discard your unsaved changes?')) return;
  App.dirty = false; await App.store.signOut();
};

function showSignIn(mode = 'in') {
  if (App.store.mode === 'demo') {
    showAuthScreen(`<div class="brand-mark">${ICON.flask}</div><h1>Lab Inventory</h1>
      <p class="lead">Try the app in demo mode. Nothing is sent to a server, and your existing inventory is not touched.</p>
      <form id="demoForm" class="stack">
        <label class="field"><span>Your name</span><input id="demoName" required autocomplete="name" placeholder="e.g. Fatemeh A."></label>
        <button class="btn primary block">Open demo</button>
      </form>`);
    $('#demoForm').addEventListener('submit', e => { e.preventDefault(); const n = $('#demoName').value.trim(); if (n) App.store.signInDemo(n); });
    return;
  }
  const isUp = mode === 'up';
  showAuthScreen(`<div class="brand-mark">${ICON.flask}</div><h1>${esc(App.config.labName || 'Lab Inventory')}</h1>
    <p class="lead">${isUp ? 'Create your account. An admin must invite your email before you can see the inventory.' : 'Sign in with your lab account.'}</p>
    <form id="authForm" class="stack">
      ${isUp ? '<label class="field"><span>Full name</span><input id="auName" required autocomplete="name"></label>' : ''}
      <label class="field"><span>Email</span><input id="auEmail" type="email" required autocomplete="email"></label>
      <label class="field"><span>Password</span><input id="auPw" type="password" required minlength="6" autocomplete="${isUp ? 'new-password' : 'current-password'}"></label>
      <button class="btn primary block">${isUp ? 'Create account' : 'Sign in'}</button>
    </form>
    <div class="auth-links">
      <button class="link" data-act="${isUp ? 'showSignInForm' : 'showSignUpForm'}">${isUp ? 'I already have an account' : 'Create an account'}</button>
      ${isUp ? '' : '<button class="link" data-act="resetPw">Forgot password?</button>'}
    </div>`);
  $('#authForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#authForm .btn'); btn.disabled = true;
    try {
      const email = $('#auEmail').value.trim(), pw = $('#auPw').value;
      if (isUp) { await App.store.signUp($('#auName').value.trim(), email, pw); onAuthChange(await App.store.reloadUser()); }
      else await App.store.signIn(email, pw);
    } catch (err) { toast(errorMessage(err), 'bad'); btn.disabled = false; }
  });
}
ACT.showSignUpForm = () => showSignIn('up');
ACT.showSignInForm = () => showSignIn('in');
ACT.resetPw = async () => {
  const email = $('#auEmail')?.value.trim();
  if (!email) { toast('Type your email first, then click "Forgot password?" again.', 'warn'); $('#auEmail')?.focus(); return; }
  try { await App.store.resetPassword(email); toast('Password reset email sent.'); } catch (err) { toast(errorMessage(err), 'bad'); }
};

function showNoAccess() {
  showAuthScreen(`<h1>Waiting for access</h1>
    <p class="lead">You are signed in as <b>${esc(App.user.email)}</b>, but this email has not been invited to the lab yet.</p>
    <p>Ask a lab admin to invite exactly this email address under <i>People</i>. Then click “Check again”.</p>
    <div class="row"><button class="btn primary" data-act="recheck">Check again</button><button class="btn ghost" data-act="signOut">Sign out</button></div>`);
}
function showVerify() {
  showAuthScreen(`<h1>Confirm your email</h1>
    <p class="lead">You have been invited. Before you can join, open the confirmation email we sent to <b>${esc(App.user.email)}</b> and click the link.</p>
    <div class="row"><button class="btn primary" data-act="recheck">I have confirmed it</button><button class="btn ghost" data-act="resendVerify">Send the email again</button></div>
    <p class="muted small">Check your spam folder if you cannot find it.</p>`);
}
ACT.recheck = async () => { try { onAuthChange(App.store.reloadUser ? await App.store.reloadUser() : App.user); } catch (err) { toast(errorMessage(err), 'bad'); } };
ACT.resendVerify = async () => { try { await App.store.sendVerification(); toast('Confirmation email sent.'); } catch (err) { toast(errorMessage(err), 'bad'); } };

function showSetup() {
  showAuthScreen(`<div class="brand-mark">${ICON.flask}</div><h1>Set up your lab</h1>
    <p class="lead">This inventory is empty. You will be its first admin. Pick the modules to start with — you can change, add or remove modules later.</p>
    <form id="setupForm" class="stack">
      <label class="field"><span>Lab name</span><input id="setupName" required value="${esc(App.config.labName || '')}" placeholder="e.g. Winkler Lab"></label>
      <fieldset class="tpl-pick"><legend>Starter modules</legend>
        ${TEMPLATES.map(t => `<label class="tpl-opt"><input type="checkbox" value="${t.tid}" checked>
          <span class="tape-label sm" style="--tb:${tape(t.color).bg};--tf:${tape(t.color).fg}">${esc(t.name)}</span>
          <span class="muted small">${esc(t.description)}</span></label>`).join('')}
      </fieldset>
      <button class="btn primary block">Create lab</button>
    </form>`);
  $('#setupForm').addEventListener('submit', async e => {
    e.preventDefault();
    const btn = $('#setupForm .btn'); btn.disabled = true; btn.textContent = 'Creating…';
    const name = $('#setupName').value.trim();
    const picked = $$('.tpl-opt input:checked').map(i => i.value);
    try {
      const u = App.user;
      // Step 1: lab + first admin in one batch (the security rules check both together).
      await App.store.batch([
        ['set', 'meta', 'lab', { name, ownerUid: u.uid, createdAt: Date.now() }],
        ['set', 'members', u.uid, { uid: u.uid, name: u.name, email: u.email || '', role: 'admin', joinedAt: Date.now() }]
      ]);
      // Step 2: modules (now allowed, because the admin exists).
      const mods = TEMPLATES.filter(t => picked.includes(t.tid)).map((t, i) => moduleFromTemplate(t, i));
      if (mods.length) await App.store.batch(mods.map(m => ['set', 'modules', m.id, m]));
      await logChange(`Created the lab "${name}"`);
      onAuthChange(u);
    } catch (err) { console.error(err); toast(errorMessage(err), 'bad'); btn.disabled = false; btn.textContent = 'Create lab'; }
  });
}

/* ── Start the app and live data ────────────────────────────────────────── */
let refreshQueued = false;
function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  requestAnimationFrame(() => { refreshQueued = false; refresh(); });
}

function startApp() {
  $('#boot').hidden = true; $('#auth').hidden = true; $('#app').hidden = false;
  const cols = ['modules', 'records', 'experiments', 'projects', 'log', 'members'];
  if (isAdmin()) cols.push('invites');
  cols.forEach(col => App.unsub.push(App.store.watch(col, list => {
    if (col === 'log') list.sort((a, b) => (b.ts || 0) - (a.ts || 0));
    App[col] = list;
    App.loaded.add(col);
    if (col === 'members') {
      const mine = list.find(m => m.id === App.user.uid);
      if (!mine && App.store.mode !== 'demo') { toast('Your access to this lab was removed.', 'bad'); App.store.signOut(); return; }
      if (mine) {
        const roleChanged = mine.role !== App.member?.role;
        App.member = { ...mine };
        if (roleChanged && App.loaded.size > 1) { toast(`Your role is now: ${mine.role}.`, 'warn'); stopListeners(); startApp(); return; }
      }
    }
    queueRefresh();
  }, err => { if (col !== 'invites') toast(`Could not load ${col}: ${errorMessage(err)}`, 'bad'); })));
  App.unsub.push(App.store.watch('meta', list => { App.lab = list.find(x => x.id === 'lab') || App.lab; queueRefresh(); }));
  renderShell();
  onHashChange(true);
}

function renderShell() {
  $('#menuBtn').innerHTML = ICON.menu;
  $('#searchIcon').innerHTML = ICON.search;
  const demo = App.store.mode === 'demo';
  $('#demoBanner').hidden = !demo;
  if (!App.searchReady) { setupGlobalSearch(); App.searchReady = true; }
}

function refresh() {
  if ($('#app').hidden) return;
  renderSidebar();
  const v = VIEWS[App.route.name];
  if (v?.form) v.onData && v.onData(App.route);
  else renderMain();
  if (App.drawer && App.drawer.mode === 'view') DRAWERS[App.drawer.kind]?.(App.drawer);
}

/* ── Routing ────────────────────────────────────────────────────────────── */
const VIEWS = {};
const DRAWERS = {};

function parseRoute() {
  const p = (location.hash.replace(/^#\/?/, '') || '').split('/').filter(Boolean).map(decodeURIComponent);
  if (!p.length) return { name: 'home' };
  if (p[0] === 'm' && p[1]) return { name: 'module', id: p[1] };
  if (p[0] === 'experiments') {
    if (!p[1]) return { name: 'expList' };
    if (p[1] === 'new') return { name: 'expEdit', id: null, from: p[2] === 'from' ? p[3] : null };
    if (p[2] === 'edit') return { name: 'expEdit', id: p[1] };
    return { name: 'expView', id: p[1] };
  }
  if (p[0] === 'projects') return { name: 'projects' };
  if (p[0] === 'order') return { name: 'order' };
  if (p[0] === 'admin') {
    if (p[1] === 'modules' && p[2] === 'new') return { name: 'moduleEdit', id: null, tid: p[3] || null };
    if (p[1] === 'modules' && p[2]) return { name: 'moduleEdit', id: p[2] };
    if (p[1] === 'modules') return { name: 'modules' };
    if (p[1] === 'people') return { name: 'people' };
    if (p[1] === 'settings') return { name: 'settings' };
  }
  return { name: 'home' };
}
let lastHash = location.hash;
function onHashChange(force) {
  if (force !== true && App.dirty && location.hash !== lastHash) {
    if (!confirm('You have unsaved changes. Leave this page and discard them?')) { history.replaceState(null, '', lastHash || '#/'); return; }
    App.dirty = false;
  }
  lastHash = location.hash;
  App.route = parseRoute();
  const needsAdmin = ['modules', 'moduleEdit', 'people', 'settings'].includes(App.route.name);
  if (needsAdmin && !isAdmin()) App.route = { name: 'home' };
  document.body.classList.remove('nav-open');
  if (App.drawer && !App.drawerDirty) closeDrawer();
  renderSidebar();
  renderMain(true);
}
const go = hash => { location.hash = hash; };

function renderMain(fresh = false) {
  const v = VIEWS[App.route.name] || VIEWS.home;
  const main = $('#main');
  const scroll = fresh ? 0 : main.scrollTop;
  const active = document.activeElement;
  const keep = !fresh && active?.id && main.contains(active) ? { id: active.id, s: active.selectionStart, e: active.selectionEnd } : null;
  v.render(App.route);
  if (fresh) { main.scrollTop = 0; main.focus({ preventScroll: true }); } else main.scrollTop = scroll;
  if (keep) { const el = document.getElementById(keep.id); if (el) { el.focus({ preventScroll: true }); try { el.setSelectionRange(keep.s, keep.e); } catch (_) { } } }
}

function setPage(title, crumbs = []) {
  document.title = `${title} · ${App.lab?.name || 'Lab Inventory'}`;
  $('#crumbs').innerHTML = crumbs.map(c => c.href ? `<a href="${c.href}">${esc(c.label)}</a>` : `<span>${esc(c.label)}</span>`).join('<span class="sep">/</span>');
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
function lowCount() {
  return App.records.filter(r => { const s = stockState(r); return s === 'low' || s === 'out'; }).length;
}
function renderSidebar() {
  const r = App.route;
  const item = (href, icon, label, active, extra = '') =>
    `<a class="nav-item${active ? ' active' : ''}" href="${href}">${icon}<span>${esc(label)}</span>${extra}</a>`;
  const low = lowCount();
  const mods = activeModules();
  $('#sidebar').innerHTML = `
    <div class="side-head"><div class="lab-name">${esc(App.lab?.name || 'Lab Inventory')}</div></div>
    <nav class="side-nav" aria-label="Main">
      ${item('#/', ICON.home, 'Overview', r.name === 'home')}
      ${item('#/experiments', ICON.flask, 'Experiments', r.name.startsWith('exp'))}
      ${item('#/projects', ICON.folder, 'Projects', r.name === 'projects')}
      ${item('#/order', ICON.cart, 'To order', r.name === 'order', low ? `<span class="count warn">${low}</span>` : '')}
      <div class="side-label">Inventory</div>
      ${mods.map(m => `<a class="nav-item mod${r.name === 'module' && r.id === m.id ? ' active' : ''}" href="#/m/${m.id}">
          ${tapeDot(m)}<span>${esc(m.name)}</span><span class="count">${recordsOf(m.id).length}</span></a>`).join('')
        || `<p class="side-empty">${isAdmin() ? 'No modules yet.' : 'No modules yet. Ask an admin to add some.'}</p>`}
      ${isAdmin() ? `<div class="side-label">Lab admin</div>
        ${item('#/admin/modules', ICON.blocks, 'Modules', r.name === 'modules' || r.name === 'moduleEdit')}
        ${item('#/admin/people', ICON.people, 'People', r.name === 'people')}
        ${item('#/admin/settings', ICON.gear, 'Lab settings', r.name === 'settings')}` : ''}
    </nav>
    <div class="side-user">
      <div class="avatar">${esc(initials(me()))}</div>
      <div class="who"><div class="nm">${esc(me())}</div><div class="rl">${esc(roleLabel(role()))}</div></div>
      <button class="icon-btn" data-act="signOut" title="Sign out" aria-label="Sign out">${ICON.out}</button>
    </div>`;
}
const initials = n => String(n).split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
const roleLabel = r => ({ admin: 'Admin', member: 'Member', viewer: 'Viewer (read only)' }[r] || r);
ACT.toggleNav = () => document.body.classList.toggle('nav-open');

/* ── Overview ───────────────────────────────────────────────────────────── */
VIEWS.home = {
  render() {
    setPage('Overview', [{ label: 'Overview' }]);
    const mods = activeModules();
    const modIds = new Set(mods.map(m => m.id));
    const recs = App.records.filter(r => modIds.has(r.moduleId));
    const out = recs.filter(r => stockState(r) === 'out');
    const low = recs.filter(r => stockState(r) === 'low');
    const expiring = [];
    recs.forEach(r => {
      const mod = modById(r.moduleId);
      visibleFields(mod).filter(f => f.type === 'date' && f.expiry && r.data?.[f.key]).forEach(f => {
        const d = daysUntil(r.data[f.key]);
        if (d <= 30) expiring.push({ r, mod, d, date: r.data[f.key] });
      });
    });
    expiring.sort((a, b) => a.d - b.d);
    const drafts = App.experiments.filter(e => (e.status || 'draft') === 'draft' && (e.createdByUid === App.user.uid || e.createdBy === me()))
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const recRow = (r, right) => `<button class="list-row" data-act="openRecord" data-id="${r.id}">
        ${tapeDot(modById(r.moduleId))}<span class="grow">${esc(recName(r))}</span>${right}</button>`;
    const attention = [
      ...out.slice(0, 6).map(r => recRow(r, `<span class="badge bad">Out</span>`)),
      ...low.slice(0, 6).map(r => recRow(r, `<span class="num muted">${fmtNum(r.stock)} ${esc(recUnit(r))}</span><span class="badge warn">Low</span>`)),
      ...expiring.slice(0, 6).map(x => recRow(x.r, `<span class="badge ${x.d < 0 ? 'bad' : 'warn'}">${x.d < 0 ? 'Expired' : x.d === 0 ? 'Expires today' : `Expires in ${x.d} d`}</span>`))
    ];

    $('#main').innerHTML = `
      <div class="page">
        <header class="page-head">
          <div><h1>${esc(App.lab?.name || 'Overview')}</h1><p class="sub">Signed in as ${esc(me())} · ${esc(roleLabel(role()))}</p></div>
          <div class="actions">${canEdit() ? `<a class="btn primary" href="#/experiments/new">${ICON.plus}New experiment</a>` : ''}</div>
        </header>
        ${!mods.length ? `<div class="empty-state"><h2>No modules yet</h2><p>Modules are the kinds of things your lab keeps track of, such as antibodies or cell lines.</p>
          ${isAdmin() ? '<a class="btn primary" href="#/admin/modules">Set up modules</a>' : '<p class="muted">Ask a lab admin to set them up.</p>'}</div>` : `
        <div class="grid-2">
          <section class="panel">
            <header class="panel-head"><h2>Needs attention</h2>${out.length + low.length ? `<a class="link" href="#/order">Open order list</a>` : ''}</header>
            <div class="list">${attention.join('') || '<p class="empty-line">Nothing is low, out of stock or expiring soon.</p>'}</div>
            ${(out.length > 6 || low.length > 6 || expiring.length > 6) ? `<p class="muted small pad">${plural(out.length, 'item')} out, ${fmtNum(low.length)} low, ${fmtNum(expiring.length)} expiring within 30 days.</p>` : ''}
          </section>
          <section class="panel">
            <header class="panel-head"><h2>Your drafts</h2><a class="link" href="#/experiments">All experiments</a></header>
            <div class="list">${drafts.slice(0, 6).map(e => `<a class="list-row" href="#/experiments/${e.id}">
                <span class="grow">${esc(e.title)}</span><span class="muted small">${esc(fmtDate(e.date))}</span><span class="badge warn">Draft</span></a>`).join('')
              || '<p class="empty-line">You have no draft experiments.</p>'}</div>
          </section>
        </div>
        <div class="grid-2">
          <section class="panel">
            <header class="panel-head"><h2>Inventory</h2></header>
            <table class="tbl compact"><thead><tr><th>Module</th><th class="r">Items</th><th class="r">Low or out</th></tr></thead><tbody>
              ${mods.map(m => {
                const rs = recordsOf(m.id); const bad = rs.filter(r => ['low', 'out'].includes(stockState(r, m))).length;
                return `<tr class="click" data-href="#/m/${m.id}"><td>${tapeLabel(m, true)}</td><td class="r num">${fmtNum(rs.length)}</td>
                  <td class="r num">${m.stock?.mode === 'none' ? '<span class="muted">—</span>' : bad ? `<span class="badge warn">${bad}</span>` : '0'}</td></tr>`;
              }).join('')}
            </tbody></table>
          </section>
          <section class="panel">
            <header class="panel-head"><h2>Recent activity</h2></header>
            <div class="list">${App.log.slice(0, 10).map(l => `<div class="log-row"><span class="grow">${esc(l.desc)}</span><span class="muted small">${esc(l.user)} · ${esc(fmtTs(l.ts))}</span></div>`).join('')
              || '<p class="empty-line">No activity yet.</p>'}</div>
          </section>
        </div>`}
      </div>`;
  }
};
ACT.go = el => go(el.dataset.href);
document.addEventListener('click', e => {
  const tr = e.target.closest('tr[data-href]');
  if (tr && !e.target.closest('a,button,input,label')) go(tr.dataset.href);
});

/* ── Global search (top bar) ────────────────────────────────────────────── */
function recordSearchText(r) {
  const mod = modById(r.moduleId);
  return [recName(r), ...visibleFields(mod).map(f => {
    const v = r.data?.[f.key];
    if (v == null || f.type === 'file' || f.type === 'table') return '';
    if (f.type === 'richtext') return htmlToText(v);
    return Array.isArray(v) ? v.join(' ') : String(v);
  })].join(' ').toLowerCase();
}
function setupGlobalSearch() {
  const input = $('#globalSearch'), pop = $('#searchPop');
  const close = () => { pop.hidden = true; };
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (q.length < 2) return close();
    const modIds = new Set(activeModules().map(m => m.id));
    const recs = App.records.filter(r => modIds.has(r.moduleId));
    let hits = recs.filter(r => recName(r).toLowerCase().includes(q));
    if (hits.length < 12) hits = hits.concat(recs.filter(r => !hits.includes(r) && recordSearchText(r).includes(q)));
    const exps = App.experiments.filter(e => (e.title || '').toLowerCase().includes(q)).slice(0, 4);
    pop.innerHTML = (hits.slice(0, 12).map(r => `<button class="list-row" data-act="openRecord" data-id="${r.id}">${tapeDot(modById(r.moduleId))}
        <span class="grow">${esc(recName(r))}</span><span class="muted small">${esc(modById(r.moduleId)?.singular || '')}</span>${stockBadge(stockState(r))}</button>`).join('')
      + exps.map(e => `<a class="list-row" href="#/experiments/${e.id}">${ICON.flask}<span class="grow">${esc(e.title)}</span><span class="muted small">Experiment</span></a>`).join(''))
      || '<p class="empty-line">No matches.</p>';
    pop.hidden = false;
  };
  input.addEventListener('input', run);
  input.addEventListener('focus', run);
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { input.value = ''; close(); input.blur(); }
    if (e.key === 'Enter') { const first = $('.list-row', pop); if (first) first.click(); }
  });
  document.addEventListener('mousedown', e => { if (!e.target.closest('.top-search')) close(); });
  pop.addEventListener('click', () => { close(); input.value = ''; });
}

/* ── Low-stock email (optional, EmailJS) ────────────────────────────────── */
function sendLowStockAlert(rec, mod, toEmail, exp) {
  const cfg = App.config.emailjs;
  if (!cfg?.serviceId || typeof emailjs === 'undefined' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail || '')) return;
  emailjs.send(cfg.serviceId, cfg.templateId, {
    to_email: toEmail, material_name: recName(rec), stock: rec.stock, unit: recUnit(rec, mod),
    location: rec.data?.location || '', updated_by: exp?.createdBy || me(),
    experiment_title: exp?.title || '', experiment_date: exp?.date || ''
  }, cfg.publicKey).catch(err => console.warn('Low-stock email failed:', err));
}

/* ── CSV download helper ────────────────────────────────────────────────── */
function downloadCsv(filename, rows) {
  const cols = [...new Set(rows.flatMap(r => Object.keys(r)))];
  const cell = v => { const t = String(v ?? '').replace(/\r?\n|\r/g, ' ').trim(); return /[",;]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };
  const csv = '﻿' + [cols.map(cell).join(','), ...rows.map(r => cols.map(c => cell(r[c])).join(','))].join('\n');
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
const fileStem = s => String(s || 'export').replace(/[^a-z0-9_-]+/gi, '_').replace(/^_+|_+$/g, '') || 'export';
