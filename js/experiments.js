/* ──────────────────────────────────────────────────────────────────────────
   experiments.js — experiments (with automatic stock reservation for any
   module set to "consume"), projects and the to-order list.
   ────────────────────────────────────────────────────────────────────────── */

/* ── Reservation helpers ────────────────────────────────────────────────── */
const itemKey = i => `${i.recordId}:${i.part || ''}`;
function normalizeItems(items) {
  const m = new Map();
  (items || []).forEach(raw => {
    const amount = Number(raw?.amount);
    if (!raw?.recordId || !Number.isFinite(amount) || amount <= 0) return;
    const k = itemKey(raw);
    if (m.has(k)) m.get(k).amount = round4(m.get(k).amount + amount);
    else m.set(k, { recordId: raw.recordId, moduleId: raw.moduleId || '', part: raw.part || '', name: raw.name || '', unit: raw.unit || '', amount: round4(amount) });
  });
  return [...m.values()];
}
function reservedItemsForExperiment(e) {
  if (!e || !e.stockReserved) return [];
  return normalizeItems(e.reservedItems || e.items);
}
function itemAvailable(item) {
  const r = recById(item.recordId);
  if (!r) return 0;
  return item.part ? Number(r.parts?.[item.part] || 0) : Number(r.stock || 0);
}
const expStatusBadge = e => (e.status || 'draft') === 'final' ? '<span class="badge ok">Final</span>' : '<span class="badge warn">Draft</span>';
function itemFromRecord(r, part = '') {
  const mod = modById(r.moduleId);
  return { recordId: r.id, moduleId: r.moduleId, part, name: recName(r) + (part ? ` — ${partLabel(mod, part)}` : ''), unit: recUnit(r, mod), amount: '' };
}

/* The core: change stock and save the experiment in one transaction.
   Works for every module whose experiment setting is "consume". */
async function commitReservation(exp, previousItems, { deleteRecord = false } = {}) {
  const desired = deleteRecord ? [] : normalizeItems(exp.items);
  const low = await App.store.transact(async tx => {
    const cur = await tx.get('experiments', exp.id);
    const previous = cur ? reservedItemsForExperiment(cur) : normalizeItems(previousItems);
    const map = new Map();
    previous.forEach(i => map.set(itemKey(i), { item: i, old: i.amount, now: 0 }));
    desired.forEach(i => { const k = itemKey(i); const row = map.get(k) || { item: i, old: 0, now: 0 }; row.item = i; row.now = i.amount; map.set(k, row); });
    const changes = [...map.values()].map(c => ({ ...c, delta: round4(c.now - c.old) })).filter(c => Math.abs(c.delta) > 1e-9);
    const byRec = new Map();
    changes.forEach(c => { const l = byRec.get(c.item.recordId) || []; l.push(c); byRec.set(c.item.recordId, l); });
    const snaps = new Map();
    for (const recId of byRec.keys()) {
      const d = await tx.get('records', recId);
      if (!d && byRec.get(recId).some(c => c.delta > 0)) throw new Error(`“${byRec.get(recId)[0].item.name}” no longer exists in the inventory. Remove it from this experiment.`);
      snaps.set(recId, d);
    }
    const ts = Date.now(), lowList = [];
    for (const [recId, chs] of byRec) {
      const d = snaps.get(recId);
      if (!d) continue; // returning stock to a deleted item: nothing to do
      const next = { ...d, parts: { ...(d.parts || {}) }, log: [...(d.log || [])] };
      for (const c of chs) {
        const before = c.item.part ? Number(next.parts[c.item.part] || 0) : Number(next.stock || 0);
        if (c.delta > before + 1e-9) throw new Error(`Not enough “${c.item.name}”. This experiment needs ${fmtNum(c.delta)} ${c.item.unit} more, but only ${fmtNum(before)} ${c.item.unit} are left.`);
        const after = round4(before - c.delta);
        if (c.item.part) next.parts[c.item.part] = after; else next.stock = after;
        next.log.unshift({ ts, user: me(), action: c.delta > 0 ? 'reserve' : 'release', amount: Math.abs(c.delta), part: c.item.part || '', note: `experiment “${exp.title}”` });
      }
      if (!Object.keys(next.parts).length) delete next.parts;
      next.log = next.log.slice(0, 30);
      tx.set('records', recId, next);
      const mod = modById(next.moduleId);
      if (mod?.stock?.mode === 'single' && chs.some(c => c.delta > 0) && Number(next.stock) <= Number(next.lowAt ?? mod.stock.lowAt ?? 0)) lowList.push(next);
    }
    if (deleteRecord) { if (cur) tx.del('experiments', exp.id); }
    else tx.set('experiments', exp.id, { ...(cur || {}), ...exp });
    return lowList;
  });
  low.forEach(r => sendLowStockAlert(r, modById(r.moduleId), exp.createdByEmail || App.user.email, exp));
}

/* ── Experiment list ────────────────────────────────────────────────────── */
App.expUi = { q: '', status: '', project: '', person: '' };
VIEWS.expList = {
  render() {
    setPage('Experiments', [{ label: 'Experiments' }]);
    const ui = App.expUi;
    const people = [...new Set(App.experiments.map(e => e.user).filter(Boolean))].sort();
    $('#main').innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Experiments</h1><p class="sub">Items you add to an experiment are reserved from stock as soon as the draft is saved.</p></div>
        <div class="actions">${canEdit() ? `<a class="btn primary" href="#/experiments/new">${ICON.plus}New experiment</a>` : ''}</div></header>
      <div class="toolbar">
        <label class="search-box">${ICON.search}<input id="exSearch" type="search" placeholder="Search experiments" value="${esc(ui.q)}" aria-label="Search experiments"></label>
        <select id="exStatus" aria-label="Status"><option value="">Any status</option><option value="draft"${ui.status === 'draft' ? ' selected' : ''}>Drafts</option><option value="final"${ui.status === 'final' ? ' selected' : ''}>Final</option></select>
        <select id="exProject" aria-label="Project"><option value="">All projects</option>${App.projects.map(p => `<option value="${p.id}"${ui.project === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
        <select id="exPerson" aria-label="Performed by"><option value="">Everyone</option>${people.map(p => `<option${ui.person === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <span class="grow"></span><button class="btn ghost sm" data-act="exportExperiments">Export CSV</button>
      </div>
      <div class="panel flush"><div class="tbl-scroll" id="exTable"></div></div></div>`;
    const bind = (id, key) => $(id).addEventListener(id === '#exSearch' ? 'input' : 'change', e => { ui[key] = e.target.value; drawExpTable(); });
    bind('#exSearch', 'q'); bind('#exStatus', 'status'); bind('#exProject', 'project'); bind('#exPerson', 'person');
    drawExpTable();
  }
};
function filteredExperiments() {
  const ui = App.expUi, q = ui.q.trim().toLowerCase();
  return App.experiments.filter(e =>
    (!ui.status || (e.status || 'draft') === ui.status) && (!ui.project || e.projectId === ui.project) && (!ui.person || e.user === ui.person) &&
    (!q || [e.title, e.aim, e.notes, htmlToText(e.result), htmlToText(e.next), (e.items || []).map(i => i.name).join(' '), (e.refs || []).map(i => i.name).join(' ')].join(' ').toLowerCase().includes(q))
  ).sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}
function drawExpTable() {
  const list = filteredExperiments();
  $('#exTable').innerHTML = !App.experiments.length
    ? `<div class="empty-state"><h2>No experiments yet</h2><p>Record what you did, what you used and what came out of it.</p>${canEdit() ? `<a class="btn primary" href="#/experiments/new">${ICON.plus}New experiment</a>` : ''}</div>`
    : `<table class="tbl"><thead><tr><th>Title</th><th>Date</th><th>Performed by</th><th>Project</th><th class="r">Items</th><th>Status</th></tr></thead><tbody>
      ${list.map(e => `<tr class="click" data-href="#/experiments/${e.id}"><td class="name">${esc(e.title)}</td><td class="nowrap">${esc(fmtDate(e.date))}</td>
        <td>${esc(e.user || '')}</td><td>${esc(projectName(e.projectId))}</td><td class="r num">${(e.items || []).length}</td><td>${expStatusBadge(e)}</td></tr>`).join('')
        || '<tr><td colspan="6" class="empty-line">No experiments match these filters.</td></tr>'}</tbody></table>`;
}
const projectName = id => App.projects.find(p => p.id === id)?.name || '';
ACT.exportExperiments = () => {
  const rows = filteredExperiments().map(e => ({
    Title: e.title, Status: e.status || 'draft', Date: e.date, 'Performed by': e.user, Project: projectName(e.projectId), Aim: e.aim,
    'Items used': (e.items || []).map(i => `${i.name} (${fmtNum(i.amount)} ${i.unit})`).join('; '),
    'Linked records': (e.refs || []).map(i => i.name).join('; '),
    Result: htmlToText(e.result), 'Next steps': htmlToText(e.next), Notes: e.notes, Attachments: (e.files || []).map(f => f.name).join('; ')
  }));
  downloadCsv(`experiments_${todayIso()}.csv`, rows);
};

/* ── Experiment detail ──────────────────────────────────────────────────── */
VIEWS.expView = {
  render(route) {
    const e = App.experiments.find(x => x.id === route.id);
    if (!e) {
      setPage('Experiment', [{ label: 'Experiments', href: '#/experiments' }]);
      $('#main').innerHTML = `<div class="page"><div class="empty-state"><h2>${App.loaded.has('experiments') ? 'This experiment does not exist' : 'Loading…'}</h2><a class="btn" href="#/experiments">Back to experiments</a></div></div>`;
      return;
    }
    setPage(e.title, [{ label: 'Experiments', href: '#/experiments' }, { label: e.title }]);
    const draft = (e.status || 'draft') === 'draft';
    const unreserved = !e.stockReserved && (e.items || []).length;
    const sec = (title, html) => html ? `<section class="panel"><header class="panel-head"><h2>${title}</h2></header><div class="panel-body">${html}</div></section>` : '';
    $('#main').innerHTML = `<div class="page narrow">
      <header class="page-head"><div><h1>${esc(e.title)} ${expStatusBadge(e)}</h1>
        <p class="sub">${esc(fmtDate(e.date) || 'No date')} · ${esc(e.user || 'Unknown')}${e.projectId ? ' · ' + esc(projectName(e.projectId)) : ''}</p></div>
        <div class="actions">
          <button class="btn ghost" data-act="printExperiment" data-id="${e.id}">${ICON.print}Print</button>
          ${canEdit() ? `<a class="btn ghost" href="#/experiments/new/from/${e.id}">Repeat</a><a class="btn" href="#/experiments/${e.id}/edit">Edit</a>
          ${draft ? `<button class="btn primary" data-act="finalizeExperiment" data-id="${e.id}">Finalize</button>` : ''}` : ''}
        </div></header>
      ${unreserved ? '<div class="notice warn">This record was imported from an older system. Its items were not reserved here. Open it and save once to reserve them, or leave it as a historical record.</div>' : ''}
      ${sec('Aim', e.aim ? `<div class="pre">${esc(e.aim)}</div>` : '')}
      ${sec('Items used', (e.items || []).length ? `<table class="tbl compact"><thead><tr><th>Item</th><th>Module</th><th class="r">Amount</th></tr></thead><tbody>
        ${e.items.map(i => { const r = recById(i.recordId); const mod = modById(i.moduleId);
          return `<tr${r ? ` class="click" data-act="openRecord" data-id="${r.id}"` : ''}><td>${esc(i.name)}${r ? '' : ' <span class="muted small">(deleted)</span>'}</td><td>${mod ? tapeLabel(mod, true) : ''}</td><td class="r num">${fmtNum(i.amount)} ${esc(i.unit)}</td></tr>`; }).join('')}
        </tbody></table><p class="muted small pad-t">${e.stockReserved ? 'These amounts are reserved (subtracted) from stock.' : 'These amounts were not reserved from stock.'}</p>` : '')}
      ${sec('Linked records', (e.refs || []).length ? `<div class="list">${e.refs.map(x => { const r = recById(x.recordId); const mod = modById(x.moduleId);
          return r ? `<button class="list-row" data-act="openRecord" data-id="${r.id}">${tapeDot(mod)}<span class="grow">${esc(recName(r))}</span><span class="muted small">${esc(mod?.singular || '')}</span></button>`
            : `<div class="list-row">${tapeDot(mod)}<span class="grow">${esc(x.name)}</span><span class="muted small">deleted</span></div>`; }).join('')}</div>` : '')}
      ${sec('Result', htmlToText(e.result) ? `<div class="prose">${sanitizeHtml(e.result)}</div>` : '')}
      ${sec('Next steps', htmlToText(e.next) ? `<div class="prose">${sanitizeHtml(e.next)}</div>` : '')}
      ${sec('Notes', e.notes ? `<div class="pre">${esc(e.notes)}</div>` : '')}
      ${sec('Attachments', (e.files || []).length ? fieldDisplay({ type: 'file' }, e.files) : '')}
      <p class="muted small">Created by ${esc(e.createdBy || '?')} ${e.createdAt ? 'on ' + esc(fmtTs(e.createdAt)) : ''}${e.finalizedAt ? ` · finalized ${esc(fmtTs(e.finalizedAt))}` : ''}</p>
      ${canEdit() ? `<div class="danger-zone"><button class="btn danger ghost" data-act="deleteExperiment" data-id="${e.id}">Delete experiment</button></div>` : ''}
    </div>`;
  }
};

ACT.finalizeExperiment = el => {
  const e = App.experiments.find(x => x.id === el.dataset.id);
  if (!e.stockReserved && (e.items || []).length) {
    openModal({ title: 'Save it once first', body: '<p class="lead">This experiment’s items were not reserved from stock yet. Open it with “Edit”, check the amounts, and save. Then you can finalize it.</p>', actions: [{ label: 'OK', kind: 'primary' }] });
    return;
  }
  openModal({
    title: 'Finalize experiment?', wide: true,
    body: `<p class="lead">A final experiment is your record of what was done. You can still edit it later if you find a mistake. Stock was already reserved when the draft was saved, so nothing is subtracted again.</p>
      <div class="review">${(e.items || []).map(i => `<div class="list-row"><span class="grow">${esc(i.name)}</span><span class="num">${fmtNum(i.amount)} ${esc(i.unit)}</span></div>`).join('') || '<p class="muted">No inventory items.</p>'}</div>`,
    actions: [{ label: 'Cancel', kind: 'ghost' }, { label: 'Print first', kind: '', onClick: () => { printExperiment(e); return true; } },
      { label: 'Finalize', kind: 'primary', onClick: async close => {
        await App.store.patch('experiments', e.id, { status: 'final', finalizedAt: Date.now() });
        await logChange(`Finalized experiment “${e.title}”`); close(); toast('Experiment finalized.');
      } }]
  });
};

ACT.deleteExperiment = async el => {
  const e = App.experiments.find(x => x.id === el.dataset.id);
  const reserved = reservedItemsForExperiment(e);
  const done = async restore => {
    if (restore) await commitReservation({ ...e, items: [] }, reserved, { deleteRecord: true });
    else await App.store.del('experiments', e.id);
    await logChange(`Deleted experiment “${e.title}”${reserved.length ? (restore ? ' and returned its stock' : ', stock kept as used') : ''}`);
    toast('Experiment deleted.'); go('#/experiments');
  };
  if (!reserved.length) { if (await confirmDialog(`Delete “${e.title}”?`, 'This cannot be undone.')) done(false).catch(err => toast(errorMessage(err), 'bad')); return; }
  openModal({
    title: `Delete “${e.title}”?`, wide: true,
    body: `<p class="lead">This experiment reserved the amounts below. Should they go back into stock?</p>
      <div class="review">${reserved.map(i => `<div class="list-row"><span class="grow">${esc(i.name)}</span><span class="num">${fmtNum(i.amount)} ${esc(i.unit)}</span></div>`).join('')}</div>
      <p class="muted small">Choose “Keep as used” if the material was really used up, for example in a failed run.</p>`,
    actions: [{ label: 'Cancel', kind: 'ghost' },
      { label: 'Delete, keep as used', kind: 'danger ghost', onClick: async close => { await done(false); close(); } },
      { label: 'Delete and return stock', kind: 'danger', onClick: async close => { await done(true); close(); } }]
  });
};

/* ── Experiment form ────────────────────────────────────────────────────── */
VIEWS.expEdit = {
  form: true,
  render(route) {
    if (!canEdit()) { go('#/experiments'); return; }
    const editing = route.id ? App.experiments.find(x => x.id === route.id) : null;
    const from = route.from ? App.experiments.find(x => x.id === route.from) : null;
    if ((route.id && !editing) || (route.from && !from)) {
      $('#main').innerHTML = `<div class="page"><div class="empty-state"><h2>${App.loaded.has('experiments') ? 'Experiment not found' : 'Loading…'}</h2></div></div>`;
      App.expForm = null;
      if (!App.loaded.has('experiments')) App.pendingFormRoute = route;
      return;
    }
    const src = editing || from || {};
    App.expForm = {
      id: editing?.id || null,
      original: editing ? reservedItemsForExperiment(editing) : [],
      items: (src.items || []).map(i => ({ ...i })),
      refs: new Map((src.refs || []).map(r => [r.recordId, r])),
      pickerQ: ''
    };
    App.dirty = false;
    const title = editing ? 'Edit experiment' : from ? 'Repeat experiment' : 'New experiment';
    setPage(title, [{ label: 'Experiments', href: '#/experiments' }, { label: title }]);
    const refMods = activeModules().filter(m => m.link === 'reference');
    $('#main').innerHTML = `<div class="page wide">
      <header class="page-head"><div><h1>${title}</h1>
        <p class="sub">${editing ? 'Changing amounts updates the stock reservation when you save.' : 'Stock is reserved when you save the draft.'}</p></div></header>
      ${from ? `<div class="notice">Copied from “${esc(from.title)}”. Result, next steps, date and attachments were cleared. Nothing is reserved until you save.</div>` : ''}
      <div class="exp-layout">
        <form id="expForm" class="exp-main" novalidate>
          <section class="panel"><div class="panel-body form-grid">
            <label class="field wide"><span>Title <span class="req">*</span></span><input id="exTitle" required value="${esc(from ? from.title + ' (repeat)' : src.title || '')}"></label>
            <label class="field"><span>Date</span><input id="exDate" type="date" value="${esc(from ? todayIso() : src.date || todayIso())}"></label>
            <label class="field"><span>Performed by</span><input id="exUser" value="${esc(from ? me() : src.user || me())}"></label>
            <label class="field wide"><span>Project</span><select id="exProject"><option value="">No project</option>${App.projects.map(p => `<option value="${p.id}"${src.projectId === p.id ? ' selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>
            <label class="field wide"><span>Aim</span><textarea id="exAim" rows="3" placeholder="What should this experiment test or produce?">${esc(src.aim || '')}</textarea></label>
          </div></section>
          <section class="panel"><header class="panel-head"><h2>Items used</h2><span class="muted small">Pick items from the inventory panel</span></header>
            <div id="exItems"></div></section>
          ${refMods.length ? `<section class="panel"><header class="panel-head"><h2>Linked records</h2><span class="muted small">For reference only — no stock is changed</span></header>
            <div class="panel-body" id="exRefs"></div></section>` : ''}
          <section class="panel"><header class="panel-head"><h2>Result</h2></header><div class="panel-body">${richEditor('exResult', from ? '' : src.result)}</div></section>
          <section class="panel"><header class="panel-head"><h2>Next steps</h2></header><div class="panel-body">${richEditor('exNext', from ? '' : src.next)}</div></section>
          <section class="panel"><div class="panel-body form-grid">
            <label class="field wide"><span>Notes</span><textarea id="exNotes" rows="3">${esc(src.notes || '')}</textarea></label>
            <div class="field wide"><span>Attachments</span>${fileInput('exFiles', from ? [] : (src.files || []))}</div>
          </div></section>
        </form>
        <aside class="exp-side panel">
          <header class="panel-head"><h2>Inventory</h2></header>
          <div class="panel-body"><label class="search-box">${ICON.search}<input id="pickQ" type="search" placeholder="Search items to add" aria-label="Search inventory"></label></div>
          <div id="picker" class="picker"></div>
        </aside>
      </div>
      <div class="sticky-foot"><span class="muted small" id="exSummary"></span><span class="grow"></span>
        <a class="btn ghost" href="${editing ? '#/experiments/' + editing.id : '#/experiments'}">Cancel</a>
        <button class="btn primary" data-act="saveExperiment">${editing ? 'Save changes' : 'Save draft'}</button></div>
    </div>`;
    renderFileList('exFiles');
    $('#expForm').addEventListener('input', () => { App.dirty = true; });
    $('#pickQ').addEventListener('input', e => { App.expForm.pickerQ = e.target.value; renderPicker(); });
    renderExpItems(); renderPicker(); renderRefs();
    setTimeout(() => $('#exTitle')?.focus(), 30);
  },
  onData(route) {
    if (!App.expForm || App.pendingFormRoute) { App.pendingFormRoute = null; return this.render(route); }
    syncItemAmounts(); renderExpItems(); renderPicker(); renderRefs(true);
  }
};

const availableForForm = item => round4(itemAvailable(item) + (App.expForm.original.find(o => itemKey(o) === itemKey(item))?.amount || 0));
function syncItemAmounts() {
  $$('#exItems .item-row').forEach(row => {
    const it = App.expForm.items.find(i => itemKey(i) === row.dataset.key);
    if (it) it.amount = $('input', row).value;
  });
}
function renderExpItems() {
  const wrap = $('#exItems'); if (!wrap) return;
  const items = App.expForm.items;
  wrap.innerHTML = items.length ? `<div class="item-rows">${items.map(i => {
    const mod = modById(i.moduleId), avail = availableForForm(i), gone = !recById(i.recordId);
    return `<div class="item-row" data-key="${esc(itemKey(i))}">${tapeDot(mod)}
      <div class="grow"><div class="nm">${esc(i.name)}</div><div class="muted small">${gone ? '<span class="bad-text">Deleted from inventory</span>' : `Available for this experiment: <span class="num">${fmtNum(avail)}</span> ${esc(i.unit)}`}</div></div>
      <label class="amount"><input inputmode="decimal" autocomplete="off" value="${esc(i.amount)}" placeholder="Amount" aria-label="Amount of ${esc(i.name)}"><span>${esc(i.unit)}</span></label>
      <button type="button" class="icon-btn sm" data-act="removeExpItem" data-key="${esc(itemKey(i))}" aria-label="Remove ${esc(i.name)}">${ICON.x}</button></div>`;
  }).join('')}</div>` : '<p class="empty-line">No items yet. Search the inventory panel and click an item to add it.</p>';
  $('#exSummary').textContent = items.length ? `${plural(items.length, 'item')} will be reserved` : '';
}
ACT.removeExpItem = el => { syncItemAmounts(); App.expForm.items = App.expForm.items.filter(i => itemKey(i) !== el.dataset.key); App.dirty = true; renderExpItems(); renderPicker(); };
ACT.addExpItem = el => {
  syncItemAmounts();
  const r = recById(el.dataset.id); if (!r) return;
  const item = itemFromRecord(r, el.dataset.part || '');
  if (!App.expForm.items.some(i => itemKey(i) === itemKey(item))) App.expForm.items.push(item);
  App.dirty = true;
  renderExpItems(); renderPicker();
  $(`#exItems [data-key="${CSS.escape(itemKey(item))}"] input`)?.focus();
};

function renderPicker() {
  const wrap = $('#picker'); if (!wrap) return;
  const openGroups = new Set($$('details[open]', wrap).map(d => d.dataset.g));
  const q = App.expForm.pickerQ.trim().toLowerCase();
  const mods = activeModules().filter(m => m.link === 'consume' && m.stock?.mode !== 'none');
  const selected = new Set(App.expForm.items.map(itemKey));
  let anyName = false;
  if (q) anyName = mods.some(m => recordsOf(m.id).some(r => recName(r).toLowerCase().includes(q)));
  const match = r => !q || (anyName ? recName(r).toLowerCase().includes(q) : recordSearchText(r).includes(q));
  const sub = (r, mod) => listFields(mod).map(f => r.data?.[f.key]).filter(v => v && !Array.isArray(v) && typeof v !== 'object').slice(0, 2).map(String).join(' · ');
  const groups = mods.map(mod => {
    const recs = recordsOf(mod.id).filter(match).sort((a, b) => recName(a).localeCompare(recName(b), undefined, { numeric: true }));
    if (!recs.length) return '';
    const rows = recs.map(r => {
      if (mod.stock.mode === 'parts') {
        const parts = (mod.stock.parts || []).filter(p => Number(r.parts?.[p.key] || 0) > 0 || selected.has(`${r.id}:${p.key}`));
        if (!parts.length) return '';
        return `<div class="pick-rec"><div class="pick-rec-head"><span class="nm">${esc(recName(r))}</span><span class="muted small">${esc(sub(r, mod))}</span></div>
          <div class="pick-parts">${parts.map(p => { const k = `${r.id}:${p.key}`, n = availableForForm({ recordId: r.id, part: p.key });
            return `<button type="button" class="pick-part" data-act="addExpItem" data-id="${r.id}" data-part="${esc(p.key)}"${selected.has(k) || n <= 0 ? ' disabled' : ''}>${esc(p.label)} <span class="num">${selected.has(k) ? 'added' : fmtNum(n)}</span></button>`; }).join('')}</div></div>`;
      }
      const it = { recordId: r.id, part: '' }, n = availableForForm(it), isSel = selected.has(itemKey(it));
      return `<button type="button" class="pick-item" data-act="addExpItem" data-id="${r.id}"${isSel || n <= 0 ? ' disabled' : ''}>
        <span class="grow"><span class="nm">${flagFor(r, mod)}${esc(recName(r))}${pictosInline(r, mod)}</span><span class="muted small">${esc(sub(r, mod))}</span></span>
        <span class="num small">${isSel ? 'Added' : n <= 0 ? 'Out' : `${fmtNum(n)} ${esc(recUnit(r, mod))}`}</span></button>`;
    }).join('');
    if (!rows) return '';
    return `<details data-g="${mod.id}"${q || openGroups.has(mod.id) ? ' open' : ''}><summary>${tapeDot(mod)}<span class="grow">${esc(mod.name)}</span><span class="muted small">${recs.length}</span></summary><div class="pick-list">${rows}</div></details>`;
  }).join('');
  wrap.innerHTML = groups || `<p class="empty-line">${mods.length ? (q ? 'No items match your search.' : 'The inventory is empty.') : 'No module is set up to be used in experiments. An admin can change this under Modules.'}</p>`;
}

function renderRefs(keepOpen = false) {
  const wrap = $('#exRefs'); if (!wrap) return;
  const openGroups = new Set($$('details[open]', wrap).map(d => d.dataset.g));
  const q = ($('#refQ')?.value || '').trim().toLowerCase();
  const refMods = activeModules().filter(m => m.link === 'reference');
  const chosen = [...App.expForm.refs.values()];
  wrap.innerHTML = `<div class="chips">${chosen.map(x => `<span class="chip removable">${tapeDot(modById(x.moduleId))}${esc(recById(x.recordId) ? recName(recById(x.recordId)) : x.name)}
      <button type="button" data-act="toggleRef" data-id="${x.recordId}" aria-label="Remove">${ICON.x}</button></span>`).join('') || '<span class="muted small">Nothing linked yet.</span>'}</div>
    ${refMods.map(mod => `<details data-g="${mod.id}"${openGroups.has(mod.id) || q ? ' open' : ''}><summary>${tapeDot(mod)}<span class="grow">Add from ${esc(mod.name)}</span></summary>
      <div class="pick-list">${recordsOf(mod.id).filter(r => !q || recName(r).toLowerCase().includes(q)).sort((a, b) => recName(a).localeCompare(recName(b))).map(r =>
        `<label class="pick-check"><input type="checkbox" data-act="toggleRef" data-id="${r.id}"${App.expForm.refs.has(r.id) ? ' checked' : ''}><span class="grow">${esc(recName(r))}</span>
         <span class="muted small">${esc(listFields(mod).map(f => r.data?.[f.key]).filter(v => v && typeof v !== 'object').slice(0, 1).join(''))}</span></label>`).join('') || '<p class="empty-line">Nothing here yet.</p>'}</div></details>`).join('')}`;
}
ACT.toggleRef = el => {
  const r = recById(el.dataset.id);
  if (App.expForm.refs.has(el.dataset.id)) App.expForm.refs.delete(el.dataset.id);
  else if (r) App.expForm.refs.set(r.id, { recordId: r.id, moduleId: r.moduleId, name: recName(r) });
  App.dirty = true;
  renderRefs(true);
};

ACT.saveExperiment = async btn => {
  const f = App.expForm;
  syncItemAmounts();
  const title = $('#exTitle').value.trim();
  if (!title) { toast('Give the experiment a title.', 'warn'); $('#exTitle').focus(); return; }
  const items = [];
  for (const i of f.items) {
    const amount = parseNum(i.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast(`Enter an amount greater than 0 for “${i.name}”. You can write 1.5 or 1,5.`, 'warn'); return; }
    items.push({ ...i, amount: round4(amount) });
  }
  const short = normalizeItems(items).filter(i => i.amount > availableForForm(i) + 1e-9);
  if (short.length) {
    openModal({ title: 'Not enough in stock', body: `<p class="lead">Lower these amounts or restock first:</p><div class="review">${short.map(i =>
      `<div class="list-row"><span class="grow">${esc(i.name)}</span><span class="small">needs <b class="num">${fmtNum(i.amount)}</b>, available <b class="num">${fmtNum(availableForForm(i))}</b> ${esc(i.unit)}</span></div>`).join('')}</div>`,
      actions: [{ label: 'OK', kind: 'primary' }] });
    return;
  }
  const existing = f.id ? App.experiments.find(x => x.id === f.id) : null;
  const id = f.id || newId();
  btn.disabled = true; btn.textContent = 'Saving…';
  try {
    const files = await finalizeFiles('exFiles', `experiments/${id}`);
    const now = Date.now();
    const exp = {
      id, title, date: $('#exDate').value, user: $('#exUser').value.trim() || me(), projectId: $('#exProject').value,
      aim: $('#exAim').value.trim(), items: normalizeItems(items), refs: [...f.refs.values()],
      result: '', next: '', notes: $('#exNotes').value.trim(), files,
      status: existing?.status || 'draft', stockReserved: true, reservedItems: normalizeItems(items),
      createdAt: existing?.createdAt || now, createdBy: existing?.createdBy || me(), createdByUid: existing?.createdByUid || App.user.uid,
      createdByEmail: existing?.createdByEmail || App.user.email || '', updatedAt: now, updatedBy: me()
    };
    exp.result = sanitizeHtml($('#exResult').innerHTML); if (!htmlToText(exp.result)) exp.result = '';
    exp.next = sanitizeHtml($('#exNext').innerHTML); if (!htmlToText(exp.next)) exp.next = '';
    await commitReservation(exp, f.original);
    await cleanupRemovedFiles('exFiles');
    await logChange(existing ? `Updated experiment “${title}”` : `Saved draft experiment “${title}” and reserved ${plural(exp.items.length, 'item')}`);
    App.dirty = false;
    toast(existing ? 'Changes saved. Stock reservation updated.' : 'Draft saved. Items reserved from stock.');
    go(`#/experiments/${id}`);
  } catch (err) {
    console.error(err); toast(errorMessage(err), 'bad');
    btn.disabled = false; btn.textContent = existing ? 'Save changes' : 'Save draft';
  }
};

/* ── Print ──────────────────────────────────────────────────────────────── */
ACT.printExperiment = el => printExperiment(App.experiments.find(x => x.id === el.dataset.id));
function printExperiment(e) {
  const sec = (t, h) => `<h2>${t}</h2><div class="box">${h || '<span class="empty">Not provided.</span>'}</div>`;
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(e.title)}</title><style>
    @page{size:A4;margin:14mm}body{font:10.5pt/1.45 'IBM Plex Sans',Arial,sans-serif;color:#111;margin:0}
    h1{font-size:17pt;margin:0 0 2pt}h2{font-size:10.5pt;margin:12pt 0 4pt;border-bottom:.6pt solid #444;padding-bottom:2pt}
    .meta{display:grid;grid-template-columns:repeat(3,1fr);gap:4pt;margin:8pt 0}.meta div{border:.5pt solid #bbb;padding:4pt 6pt}
    .meta b{display:block;font-size:7.5pt;color:#555;font-weight:600}.box{border:.5pt solid #ccc;padding:5pt 7pt}
    table{width:100%;border-collapse:collapse;font-size:9.5pt}th,td{border:.5pt solid #bbb;padding:3pt 5pt;text-align:left;vertical-align:top}th{background:#f1f1f1}
    .empty{color:#777;font-style:italic}.small{font-size:8.5pt;color:#555}.sig{display:grid;grid-template-columns:1fr 1fr;gap:30pt;margin-top:28pt}.sig div{border-top:.6pt solid #222;padding-top:3pt;font-size:8.5pt}
    </style></head><body>
    <h1>${esc(e.title)}</h1><div class="small">${esc(App.lab?.name || '')} · printed ${esc(fmtTs(Date.now()))}</div>
    <div class="meta"><div><b>Date</b>${esc(fmtDate(e.date) || '—')}</div><div><b>Performed by</b>${esc(e.user || '—')}</div><div><b>Project</b>${esc(projectName(e.projectId) || '—')}</div>
      <div><b>Status</b>${(e.status || 'draft') === 'final' ? 'Final' : 'Draft'}</div><div><b>Stock</b>${e.stockReserved ? 'Reserved from inventory' : 'Not reserved'}</div><div><b>Items</b>${(e.items || []).length}</div></div>
    ${sec('Aim', e.aim ? esc(e.aim).replace(/\n/g, '<br>') : '')}
    <h2>Items used</h2>${(e.items || []).length ? `<table><thead><tr><th>Item</th><th>Module</th><th>Amount</th><th>Details</th></tr></thead><tbody>${e.items.map(i => {
      const r = recById(i.recordId), mod = modById(i.moduleId);
      const det = r ? listFields(mod).map(f => { const v = fieldPlain(f, r.data?.[f.key]); return v ? `${esc(f.label)}: ${esc(v)}` : ''; }).filter(Boolean).join('<br>') : '';
      return `<tr><td>${esc(i.name)}</td><td>${esc(mod?.name || '')}</td><td>${fmtNum(i.amount)} ${esc(i.unit)}</td><td class="small">${det}</td></tr>`; }).join('')}</tbody></table>` : '<div class="box"><span class="empty">None.</span></div>'}
    ${(e.refs || []).length ? sec('Linked records', e.refs.map(x => `${esc(modById(x.moduleId)?.singular || '')}: ${esc(recById(x.recordId) ? recName(recById(x.recordId)) : x.name)}`).join('<br>')) : ''}
    ${sec('Result', htmlToText(e.result) ? sanitizeHtml(e.result) : '')}
    ${sec('Next steps', htmlToText(e.next) ? sanitizeHtml(e.next) : '')}
    ${sec('Notes', e.notes ? esc(e.notes).replace(/\n/g, '<br>') : '')}
    ${(e.files || []).length ? sec('Attachments', e.files.map(f => esc(f.name)).join('<br>')) : ''}
    <div class="sig"><div>Signature</div><div>Date</div></div></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { downloadBlob(`${fileStem(e.title)}.html`, new Blob([html], { type: 'text/html' })); toast('Pop-ups are blocked, so the print page was downloaded instead.', 'warn'); return; }
  w.document.open(); w.document.write(html); w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 350);
}

/* ── Projects ───────────────────────────────────────────────────────────── */
VIEWS.projects = {
  render() {
    setPage('Projects', [{ label: 'Projects' }]);
    const list = [...App.projects].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    $('#main').innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Projects</h1><p class="sub">Group inventory items and experiments that belong together.</p></div>
        <div class="actions">${canEdit() ? `<button class="btn primary" data-act="newProject">${ICON.plus}New project</button>` : ''}</div></header>
      <div class="panel flush"><div class="tbl-scroll">${list.length ? `<table class="tbl"><thead><tr><th>Project</th><th class="r">Linked items</th><th class="r">Experiments</th><th>Created by</th></tr></thead><tbody>
        ${list.map(p => `<tr class="click" data-act="openProject" data-id="${p.id}"><td class="name">${esc(p.name)}<div class="muted small clamp">${esc(p.desc || '')}</div></td>
          <td class="r num">${(p.links || []).filter(recById).length}</td><td class="r num">${App.experiments.filter(e => e.projectId === p.id).length}</td><td>${esc(p.createdBy || '')}</td></tr>`).join('')}
        </tbody></table>` : `<div class="empty-state"><h2>No projects yet</h2><p>A project collects the antibodies, models and experiments for one study.</p>${canEdit() ? `<button class="btn primary" data-act="newProject">${ICON.plus}New project</button>` : ''}</div>`}</div></div></div>`;
  }
};
ACT.openProject = el => { App.drawer = { kind: 'project', id: el.dataset.id, mode: 'view' }; DRAWERS.project(App.drawer); };
ACT.newProject = () => { App.drawer = { kind: 'project', id: null, mode: 'edit' }; DRAWERS.project(App.drawer); };
ACT.editProject = el => { App.drawer = { kind: 'project', id: el.dataset.id, mode: 'edit' }; DRAWERS.project(App.drawer); };
DRAWERS.project = d => {
  const p = d.id ? App.projects.find(x => x.id === d.id) : null;
  if (d.id && !p) { closeDrawer(); return; }
  if (d.mode === 'edit') return renderProjectForm(p);
  const links = (p.links || []).map(recById).filter(Boolean);
  const byMod = activeModules().map(m => ({ m, recs: links.filter(r => r.moduleId === m.id) })).filter(x => x.recs.length);
  const exps = App.experiments.filter(e => e.projectId === p.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  openDrawer(`<header class="drawer-head"><div><span class="eyebrow-plain">Project</span><h2>${esc(p.name)}</h2><p class="muted small">Created by ${esc(p.createdBy || '?')}</p></div>
      <button class="icon-btn" data-act="closeDrawer" aria-label="Close">${ICON.x}</button></header>
    <div class="drawer-body">${p.desc ? `<p class="pre">${esc(p.desc)}</p>` : ''}
      ${byMod.map(x => `<section class="sub-sec"><h3>${tapeLabel(x.m, true)}</h3>${x.recs.map(r => `<button class="list-row" data-act="openRecord" data-id="${r.id}"><span class="grow">${esc(recName(r))}</span>${stockBadge(stockState(r))}</button>`).join('')}</section>`).join('')
        || '<p class="muted">No inventory items linked yet.</p>'}
      <section class="sub-sec"><h3>Experiments</h3>${exps.map(e => `<a class="list-row" href="#/experiments/${e.id}"><span class="grow">${esc(e.title)}</span><span class="muted small">${esc(fmtDate(e.date))}</span>${expStatusBadge(e)}</a>`).join('') || '<p class="muted small">No experiments assigned to this project.</p>'}</section>
    </div>
    ${canEdit() ? `<footer class="drawer-foot"><button class="btn danger ghost" data-act="deleteProject" data-id="${p.id}">Delete</button><span class="grow"></span><button class="btn primary" data-act="editProject" data-id="${p.id}">Edit</button></footer>` : ''}`);
};
function renderProjectForm(p) {
  App.drawerDirty = false;
  const chosen = new Set(p?.links || []);
  openDrawer(`<header class="drawer-head"><div><h2>${p ? 'Edit project' : 'New project'}</h2></div><button class="icon-btn" data-act="closeDrawer" aria-label="Close">${ICON.x}</button></header>
    <form class="drawer-body stack" id="projForm">
      <label class="field"><span>Name <span class="req">*</span></span><input id="pjName" value="${esc(p?.name || '')}" required></label>
      <label class="field"><span>Description</span><textarea id="pjDesc" rows="3">${esc(p?.desc || '')}</textarea></label>
      <div class="field"><span>Linked inventory items</span>
        <label class="search-box">${ICON.search}<input id="pjQ" type="search" placeholder="Search all modules" aria-label="Search items"></label>
        <div id="pjPick" class="picker bordered"></div></div>
    </form>
    <footer class="drawer-foot"><span class="grow"></span><button class="btn ghost" data-act="closeDrawer">Cancel</button><button class="btn primary" data-act="saveProject" data-id="${p?.id || ''}">${p ? 'Save changes' : 'Create project'}</button></footer>`);
  const draw = () => {
    const q = $('#pjQ').value.trim().toLowerCase();
    const open = new Set($$('#pjPick details[open]').map(x => x.dataset.g));
    $('#pjPick').innerHTML = activeModules().map(m => {
      const recs = recordsOf(m.id).filter(r => !q || recName(r).toLowerCase().includes(q));
      if (!recs.length) return '';
      const n = recs.filter(r => chosen.has(r.id)).length;
      return `<details data-g="${m.id}"${q || open.has(m.id) ? ' open' : ''}><summary>${tapeDot(m)}<span class="grow">${esc(m.name)}</span><span class="muted small">${n ? n + ' linked' : ''}</span></summary><div class="pick-list">
        ${recs.sort((a, b) => recName(a).localeCompare(recName(b), undefined, { numeric: true })).map(r => `<label class="pick-check"><input type="checkbox" value="${r.id}"${chosen.has(r.id) ? ' checked' : ''}><span class="grow">${esc(recName(r))}</span></label>`).join('')}</div></details>`;
    }).join('') || '<p class="empty-line">No items found.</p>';
  };
  $('#pjQ').addEventListener('input', draw);
  $('#pjPick').addEventListener('change', e => { if (e.target.checked) chosen.add(e.target.value); else chosen.delete(e.target.value); App.drawerDirty = true; draw(); });
  $('#projForm').addEventListener('input', () => { App.drawerDirty = true; });
  App.projectChosen = chosen;
  draw();
  setTimeout(() => $('#pjName').focus(), 50);
}
ACT.saveProject = async btn => {
  const name = $('#pjName').value.trim();
  if (!name) { toast('Give the project a name.', 'warn'); return; }
  const old = btn.dataset.id ? App.projects.find(x => x.id === btn.dataset.id) : null;
  const id = old?.id || newId();
  try {
    await App.store.put('projects', id, { ...(old || {}), id, name, desc: $('#pjDesc').value.trim(), links: [...App.projectChosen],
      createdAt: old?.createdAt || Date.now(), createdBy: old?.createdBy || me(), updatedAt: Date.now() });
    await logChange(`${old ? 'Updated' : 'Created'} project “${name}”`);
    App.drawerDirty = false;
    App.drawer = { kind: 'project', id, mode: 'view' }; DRAWERS.project(App.drawer);
    toast(old ? 'Project saved.' : 'Project created.');
  } catch (err) { toast(errorMessage(err), 'bad'); }
};
ACT.deleteProject = async el => {
  const p = App.projects.find(x => x.id === el.dataset.id);
  if (!await confirmDialog(`Delete project “${p.name}”?`, 'Its items and experiments are not deleted. Experiments simply lose their project label.')) return;
  await App.store.del('projects', p.id); await logChange(`Deleted project “${p.name}”`); closeDrawer(); toast('Project deleted.');
};

/* ── To order ───────────────────────────────────────────────────────────── */
function orderList() {
  return activeModules().filter(m => m.stock?.mode === 'single').map(m => ({
    m, recs: recordsOf(m.id).filter(r => ['low', 'out'].includes(stockState(r, m)))
      .sort((a, b) => (stockState(a, m) === 'out' ? 0 : 1) - (stockState(b, m) === 'out' ? 0 : 1) || recName(a).localeCompare(recName(b)))
  })).filter(x => x.recs.length);
}
VIEWS.order = {
  render() {
    setPage('To order', [{ label: 'To order' }]);
    const groups = orderList();
    const val = (r, k) => r.data?.[k] || '';
    $('#main').innerHTML = `<div class="page">
      <header class="page-head"><div><h1>To order</h1><p class="sub">Everything at or below its low-stock level.</p></div>
        <div class="actions">${groups.length ? `<button class="btn ghost" data-act="copyOrder">Copy as text</button><button class="btn" data-act="exportOrder">Export CSV</button>` : ''}</div></header>
      ${groups.map(({ m, recs }) => `<section class="panel flush"><header class="panel-head">${tapeLabel(m, true)}<span class="muted small">${plural(recs.length, 'item')}</span></header>
        <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Name</th><th class="r">Have</th><th class="r">Alert at</th><th>Company</th><th>Catalog</th><th>Location</th><th class="r">Order</th></tr></thead><tbody>
        ${recs.map(r => `<tr class="click" data-act="openRecord" data-id="${r.id}"${tintAttr(r, m)}><td class="name">${flagFor(r, m)}${esc(recName(r))}${pictosInline(r, m)} ${stockBadge(stockState(r, m))}</td>
          <td class="r num">${fmtNum(r.stock || 0)} ${esc(recUnit(r, m))}</td><td class="r num">${fmtNum(r.lowAt ?? m.stock.lowAt)}</td>
          <td>${esc(val(r, 'company'))}</td><td class="mono-sm">${esc(val(r, 'catalog'))}</td><td>${esc(val(r, 'location'))}</td>
          <td class="r">${orderButton(r, m, 'btn sm') || '<span class="muted small">no link</span>'}</td></tr>`).join('')}
        </tbody></table></div></section>`).join('') || '<div class="empty-state"><h2>Nothing to order</h2><p>All items are above their low-stock level.</p></div>'}
    </div>`;
  }
};
ACT.copyOrder = () => {
  const text = orderList().map(({ m, recs }) => `${m.name}\n` + recs.map(r => `- ${recName(r)}${r.data?.company ? ` (${r.data.company})` : ''}${r.data?.catalog ? ` [${r.data.catalog}]` : ''}: have ${fmtNum(r.stock || 0)} ${recUnit(r, m)}${orderUrl(r, m) ? ` — ${orderUrl(r, m)}` : ''}`).join('\n')).join('\n\n');
  navigator.clipboard?.writeText(text).then(() => toast('Order list copied.'), () => toast('Could not copy. Use “Export CSV” instead.', 'warn'));
};
ACT.exportOrder = () => downloadCsv(`to_order_${todayIso()}.csv`, orderList().flatMap(({ m, recs }) => recs.map(r => ({
  Module: m.name, Name: recName(r), Have: r.stock || 0, Unit: recUnit(r, m), 'Alert at': r.lowAt ?? m.stock.lowAt,
  Company: r.data?.company || '', Catalog: r.data?.catalog || '', Location: r.data?.location || '', 'Order link': orderUrl(r, m)
}))));

/* ── Activity log ───────────────────────────────────────────────────────── */
App.actUi = { q: '', person: '' };
VIEWS.activity = {
  render() {
    setPage('Activity', [{ label: 'Activity' }]);
    const ui = App.actUi;
    const people = [...new Set(App.log.map(l => l.user).filter(Boolean))].sort();
    $('#main').innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Activity</h1><p class="sub">Every change in the inventory: who did what, and when. Newest first.</p></div>
        <div class="actions"><button class="btn ghost" data-act="exportActivity">Export CSV</button></div></header>
      <div class="toolbar">
        <label class="search-box">${ICON.search}<input id="acSearch" type="search" placeholder="Search activity" value="${esc(ui.q)}" aria-label="Search activity"></label>
        <select id="acPerson" aria-label="Person"><option value="">Everyone</option>${people.map(p => `<option${ui.person === p ? ' selected' : ''}>${esc(p)}</option>`).join('')}</select>
        <span class="grow"></span><span id="acCount" class="muted small"></span>
      </div>
      <div class="panel flush"><div class="tbl-scroll" id="acTable"></div></div></div>`;
    $('#acSearch').addEventListener('input', e => { ui.q = e.target.value; drawActivity(); });
    $('#acPerson').addEventListener('change', e => { ui.person = e.target.value; drawActivity(); });
    drawActivity();
  }
};
function filteredActivity() {
  const q = App.actUi.q.trim().toLowerCase();
  return App.log.filter(l => (!App.actUi.person || l.user === App.actUi.person) && (!q || `${l.desc} ${l.user}`.toLowerCase().includes(q)));
}
function drawActivity() {
  const list = filteredActivity();
  const shown = list.slice(0, 500);
  $('#acCount').textContent = list.length > shown.length ? `Showing the newest ${fmtNum(shown.length)} of ${fmtNum(list.length)}` : plural(list.length, 'entry', 'entries');
  $('#acTable').innerHTML = shown.length ? `<table class="tbl"><thead><tr><th>When</th><th>Who</th><th>What</th></tr></thead><tbody>
    ${shown.map(l => `<tr><td class="nowrap muted">${esc(fmtTs(l.ts))}</td><td class="nowrap">${esc(l.user || '')}</td><td>${esc(l.desc)}</td></tr>`).join('')}</tbody></table>`
    : '<p class="empty-line">No activity matches.</p>';
}
ACT.exportActivity = () => downloadCsv(`activity_${todayIso()}.csv`, filteredActivity().map(l => ({ When: new Date(l.ts).toISOString(), Who: l.user, What: l.desc })));
