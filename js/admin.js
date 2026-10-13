/* ──────────────────────────────────────────────────────────────────────────
   admin.js — module builder, people & roles, lab settings, backup/restore
   and the importer for backups from the original Lab Inventory app.
   ────────────────────────────────────────────────────────────────────────── */

const stockText = m => m.stock?.mode === 'single' ? `One amount (${m.stock.unit || 'units'})`
  : m.stock?.mode === 'parts' ? `Counted per part (${(m.stock.parts || []).length} parts)` : 'No stock';
const linkText = m => m.link === 'consume' ? 'Reserved from stock' : m.link === 'reference' ? 'Linked for reference' : 'Not used';

/* ── Modules list ───────────────────────────────────────────────────────── */
VIEWS.modules = {
  render() {
    setPage('Modules', [{ label: 'Lab admin' }, { label: 'Modules' }]);
    const act = activeModules();
    const arch = App.modules.filter(m => m.archived);
    $('#main').innerHTML = `<div class="page">
      <header class="page-head"><div><h1>Modules</h1><p class="sub">Each module is one kind of thing your lab tracks. You decide its fields, how stock is counted, and whether experiments use it up.</p></div>
        <div class="actions"><button class="btn ghost" data-act="fromTemplate">Add from template</button><a class="btn primary" href="#/admin/modules/new">${ICON.plus}New module</a></div></header>
      <div class="panel flush"><div class="tbl-scroll">${act.length ? `<table class="tbl"><thead><tr><th>Module</th><th class="r">Items</th><th>Stock</th><th>In experiments</th><th class="r">Fields</th><th class="r">Order</th></tr></thead><tbody>
        ${act.map((m, i) => `<tr class="click" data-href="#/admin/modules/${m.id}"><td>${tapeLabel(m, true)}</td><td class="r num">${recordsOf(m.id).length}</td>
          <td>${esc(stockText(m))}</td><td>${esc(linkText(m))}</td><td class="r num">${visibleFields(m).length}</td>
          <td class="r nowrap"><button class="icon-btn sm" data-act="moveModule" data-id="${m.id}" data-d="-1" aria-label="Move up"${i === 0 ? ' disabled' : ''}>${ICON.up}</button>
            <button class="icon-btn sm" data-act="moveModule" data-id="${m.id}" data-d="1" aria-label="Move down"${i === act.length - 1 ? ' disabled' : ''}>${ICON.down}</button></td></tr>`).join('')}
        </tbody></table>` : `<div class="empty-state"><h2>No modules yet</h2><p>Start from a template, such as Antibodies or Cell lines, or build your own.</p><button class="btn primary" data-act="fromTemplate">Add from template</button></div>`}</div></div>
      ${arch.length ? `<section class="panel flush"><header class="panel-head"><h2>Archived</h2><span class="muted small">Hidden from everyone. Their items are kept.</span></header>
        <table class="tbl"><tbody>${arch.map(m => `<tr><td>${tapeLabel(m, true)}</td><td class="r num">${plural(recordsOf(m.id).length, 'item')}</td>
          <td class="r nowrap"><button class="btn sm" data-act="restoreModule" data-id="${m.id}">Restore</button>
          ${recordsOf(m.id).length ? '' : `<button class="btn sm danger ghost" data-act="deleteModule" data-id="${m.id}">Delete</button>`}</td></tr>`).join('')}</tbody></table></section>` : ''}
    </div>`;
  }
};
ACT.moveModule = async el => {
  const list = activeModules(), i = list.findIndex(m => m.id === el.dataset.id), j = i + Number(el.dataset.d);
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await App.store.batch(list.map((m, k) => ['merge', 'modules', m.id, { order: k }]));
};
ACT.restoreModule = async el => { await App.store.patch('modules', el.dataset.id, { archived: false }); await logChange(`Restored module “${modById(el.dataset.id).name}”`); };
ACT.deleteModule = async el => {
  const m = modById(el.dataset.id);
  if (!await confirmDialog(`Delete module “${m.name}”?`, 'It has no items. This cannot be undone.')) return;
  await App.store.del('modules', m.id); await logChange(`Deleted module “${m.name}”`);
};
ACT.fromTemplate = () => {
  const have = new Set(App.modules.map(m => m.tid).filter(Boolean));
  const modal = openModal({
    title: 'Add a module from a template', wide: true,
    body: `<p class="muted">You can change everything after adding it.</p><div class="list">${TEMPLATES.map(t => `<button class="list-row tpl-row" data-tid="${t.tid}">
      <span class="tape-label sm" style="--tb:${tape(t.color).bg};--tf:${tape(t.color).fg}">${esc(t.name)}</span>
      <span class="grow muted small">${esc(t.description)}</span>${have.has(t.tid) ? '<span class="badge">Already added</span>' : ''}</button>`).join('')}</div>`
  });
  $$('.tpl-row', modal.el).forEach(b => b.addEventListener('click', () => { modal.close(); go(`#/admin/modules/new/${b.dataset.tid}`); }));
};

/* ── Module editor ──────────────────────────────────────────────────────── */
VIEWS.moduleEdit = {
  form: true,
  render(route) {
    let m;
    if (route.id) {
      const src = modById(route.id);
      if (!src) { $('#main').innerHTML = `<div class="page"><div class="empty-state"><h2>${App.loaded.has('modules') ? 'Module not found' : 'Loading…'}</h2></div></div>`; App.modForm = null; return; }
      m = JSON.parse(JSON.stringify(src));
    } else if (route.tid) {
      const t = TEMPLATES.find(x => x.tid === route.tid);
      m = moduleFromTemplate(t, App.modules.length);
      m.isNew = true;
    } else {
      const used = new Set(App.modules.map(x => x.color));
      m = {
        id: newId(), isNew: true, name: '', singular: '', description: '', color: Object.keys(TAPES).find(c => !used.has(c)) || 'grey',
        stock: { mode: 'single', unit: 'units', lowAt: 1, parts: [] }, link: 'consume', order: App.modules.length, archived: false, version: 0,
        fields: [{ ...F('name', 'Name', 'text', { required: true, inList: true }), id: newId() }, { ...F('location', 'Storage location', 'text', { inList: true }), id: newId() }, { ...F('notes', 'Notes', 'textarea'), id: newId() }]
      };
    }
    m.stock = m.stock || { mode: 'none', parts: [] };
    m.stock.parts = m.stock.parts || [];
    App.modForm = m;
    App.dirty = false;
    drawModuleEditor();
  },
  onData() {
    if (!App.modForm && App.route.id) this.render(App.route);
  }
};

function drawModuleEditor() {
  const m = App.modForm;
  const title = m.isNew ? 'New module' : `Edit module`;
  setPage(title, [{ label: 'Lab admin' }, { label: 'Modules', href: '#/admin/modules' }, { label: m.name || title }]);
  const recCount = m.isNew ? 0 : recordsOf(m.id).length;
  const shown = m.fields.map((f, i) => ({ f, i })).filter(x => !x.f.hidden);
  const hidden = m.fields.map((f, i) => ({ f, i })).filter(x => x.f.hidden);
  $('#main').innerHTML = `<div class="page narrow">
    <header class="page-head"><div><h1>${m.isNew ? 'New module' : tapeLabel({ name: m.name || 'Module', color: m.color })}</h1>
      <p class="sub">${m.isNew ? 'Describe one kind of item. The app builds the form, the table and the stock handling from this.' : `${plural(recCount, 'item')} use this module. Changes apply to all of them.`}</p></div></header>

    <section class="panel"><header class="panel-head"><h2>Name and colour</h2></header><div class="panel-body form-grid">
      <label class="field"><span>Name (plural)</span><input id="meName" value="${esc(m.name)}" placeholder="e.g. Samples"></label>
      <label class="field"><span>One item is called</span><input id="meSingular" value="${esc(m.singular)}" placeholder="e.g. Sample"></label>
      <label class="field wide"><span>Short description</span><input id="meDesc" value="${esc(m.description || '')}" placeholder="Shown at the top of the module page"></label>
      <div class="field wide"><span>Tape colour</span><div class="swatches" role="radiogroup" aria-label="Tape colour">${Object.entries(TAPES).map(([k, t]) =>
        `<label class="swatch" title="${t.name}"><input type="radio" name="meColor" value="${k}"${m.color === k ? ' checked' : ''}><span style="--tb:${t.bg}"></span></label>`).join('')}</div></div>
    </div></section>

    <section class="panel"><header class="panel-head"><h2>Stock</h2></header><div class="panel-body stack">
      <div class="choice-cards">
        ${[['single', 'One amount per item', 'For example 250 µL of an antibody or 5 vials of a cell line.'],
           ['parts', 'Counted per part', 'One item holds several counts, for example tissue samples per organ of a mouse.'],
           ['none', 'No stock', 'Only information, for example protocols or SOPs.']].map(([v, t, d]) =>
          `<label class="choice"><input type="radio" name="meStock" value="${v}"${m.stock.mode === v ? ' checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}
      </div>
      ${m.stock.mode === 'single' ? `<div class="form-grid"><label class="field"><span>Default unit</span><input id="meUnit" value="${esc(m.stock.unit || '')}" placeholder="µL, mg, vials, kits…"></label>
        <label class="field"><span>Default low-stock alert at</span><input id="meLow" inputmode="decimal" value="${esc(m.stock.lowAt ?? '')}"></label></div>` : ''}
      ${m.stock.mode === 'parts' ? `<div class="form-grid"><label class="field"><span>Unit</span><input id="meUnit" value="${esc(m.stock.unit || '')}" placeholder="pcs"></label></div>
        <div class="field"><span>Parts</span><div class="parts-edit">${m.stock.parts.map((p, i) => `<span class="part-edit"><input class="mePart" data-i="${i}" value="${esc(p.label)}" aria-label="Part name">
          <button type="button" class="icon-btn sm" data-act="mePartDel" data-i="${i}" aria-label="Remove part">${ICON.x}</button></span>`).join('')}
          <button type="button" class="btn ghost sm" data-act="mePartAdd">${ICON.plus}Add part</button></div></div>` : ''}
      ${!m.isNew && recCount ? '<p class="help">Changing how stock is counted does not delete existing numbers, but items may show 0 until you fill in the new counts.</p>' : ''}
    </div></section>

    <section class="panel"><header class="panel-head"><h2>Use in experiments</h2></header><div class="panel-body">
      <div class="choice-cards">
        ${[['consume', 'Reserve from stock', 'Adding an item to an experiment subtracts the amount used.', m.stock.mode === 'none'],
           ['reference', 'Link for reference', 'Experiments can point to items (like a protocol). Stock is not changed.', false],
           ['none', 'Do not use', 'This module does not appear in experiments.', false]].map(([v, t, d, dis]) =>
          `<label class="choice${dis ? ' disabled' : ''}"><input type="radio" name="meLink" value="${v}"${m.link === v ? ' checked' : ''}${dis ? ' disabled' : ''}><span><b>${t}</b><small>${dis ? 'Needs stock tracking. Pick “One amount” or “Counted per part” above.' : d}</small></span></label>`).join('')}
      </div></div></section>

    <section class="panel"><header class="panel-head"><h2>Fields</h2><span class="muted small">“Show in table” adds the field as a column on the module page</span></header>
      <div class="fe-list">${shown.map(({ f, i }, k) => fieldEditorRow(f, i, k, shown.length)).join('')}</div>
      <div class="panel-body"><button type="button" class="btn ghost" data-act="meFieldAdd">${ICON.plus}Add field</button></div>
      ${hidden.length ? `<div class="panel-body hidden-fields"><h3>Hidden fields</h3><p class="muted small">Hidden fields keep their data. Restore one to show it again.</p>
        ${hidden.map(({ f, i }) => `<div class="list-row"><span class="grow">${esc(f.label)} <span class="muted small">${esc(FIELD_TYPES[f.type]?.label || f.type)}</span></span><button type="button" class="btn sm" data-act="meFieldRestore" data-i="${i}">Restore</button></div>`).join('')}</div>` : ''}
    </section>

    ${!m.isNew ? `<div class="danger-zone"><button class="btn danger ghost" data-act="archiveModule">Archive this module</button><span class="muted small">Archiving hides the module. Its items are kept and can be restored.</span></div>` : ''}
    <div class="sticky-foot"><span class="grow"></span><a class="btn ghost" href="#/admin/modules">Cancel</a><button class="btn primary" data-act="saveModule">${m.isNew ? 'Create module' : 'Save module'}</button></div>
  </div>`;
  const main = $('#main');
  main.querySelectorAll('input,select,textarea').forEach(el => el.addEventListener('input', () => { App.dirty = true; }));
  $$('input[name=meStock]').forEach(r => r.addEventListener('change', () => {
    syncModForm();
    if (m.stock.mode === 'parts' && !m.stock.parts.length) m.stock.parts = [{ key: 'part1', label: 'Part 1' }];
    if (m.stock.mode === 'none' && m.link === 'consume') m.link = 'reference';
    if (m.stock.mode === 'parts' && !m.stock.unit) m.stock.unit = 'pcs';
    drawModuleEditor();
  }));
  $$('.fe-type').forEach(s => s.addEventListener('change', () => { syncModForm(); drawModuleEditor(); }));
}

function fieldEditorRow(f, i, k, n) {
  const isName = f.key === 'name';
  return `<div class="fe-row" data-i="${i}">
    <div class="fe-grip num muted">${k + 1}</div>
    <div class="fe-body">
      <div class="fe-line">
        <label class="field fe-label-wrap"><span class="sr">Field name</span><input class="fe-label" value="${esc(f.label)}" placeholder="Field name" aria-label="Field name"></label>
        <label class="field"><span class="sr">Type</span><select class="fe-type" aria-label="Field type"${isName ? ' disabled' : ''}>${Object.entries(FIELD_TYPES).map(([t, x]) => `<option value="${t}"${f.type === t ? ' selected' : ''}>${esc(x.label)}</option>`).join('')}</select></label>
      </div>
      <div class="fe-opts-line">
        ${['richtext', 'table', 'file'].includes(f.type) ? '' : `<label class="check"><input type="checkbox" class="fe-inlist"${f.inList ? ' checked' : ''}${isName ? ' checked disabled' : ''}>Show in table</label>`}
        <label class="check"><input type="checkbox" class="fe-req"${f.required || isName ? ' checked' : ''}${isName || f.type === 'checkbox' || f.type === 'file' ? ' disabled' : ''}>Required</label>
        ${f.type === 'date' ? `<label class="check"><input type="checkbox" class="fe-exp"${f.expiry ? ' checked' : ''}>Warn before this date (expiry)</label>` : ''}
        ${isName ? '<span class="muted small">Every item needs a name. You can rename this field.</span>' : ''}
        ${f.isNew ? '<span class="badge">New</span>' : ''}
      </div>
      ${FIELD_TYPES[f.type]?.options ? `<label class="field"><span>${f.type === 'select' ? 'Preset choices (one per line, optional — users can always add their own)' : 'Choices (one per line)'}</span><textarea class="fe-opts" rows="3">${esc((f.options || []).join('\n'))}</textarea></label>` : ''}
      ${FIELD_TYPES[f.type]?.columns ? `<label class="field"><span>Column names (separate with commas)</span><input class="fe-cols" value="${esc((f.columns || []).join(', '))}"></label>` : ''}
      <label class="field"><span>Help text (optional)</span><input class="fe-help" value="${esc(f.help || '')}" placeholder="Shown under the input"></label>
    </div>
    <div class="fe-act">
      <button type="button" class="icon-btn sm" data-act="meFieldMove" data-i="${i}" data-d="-1" aria-label="Move up"${k === 0 ? ' disabled' : ''}>${ICON.up}</button>
      <button type="button" class="icon-btn sm" data-act="meFieldMove" data-i="${i}" data-d="1" aria-label="Move down"${k === n - 1 ? ' disabled' : ''}>${ICON.down}</button>
      ${isName ? '' : `<button type="button" class="btn sm ghost" data-act="meFieldHide" data-i="${i}">${f.isNew ? 'Remove' : 'Hide'}</button>`}
    </div></div>`;
}

function syncModForm() {
  const m = App.modForm;
  if (!$('#meName')) return;
  m.name = $('#meName').value.trim();
  m.singular = $('#meSingular').value.trim();
  m.description = $('#meDesc').value.trim();
  m.color = $('input[name=meColor]:checked')?.value || m.color;
  m.stock.mode = $('input[name=meStock]:checked')?.value || m.stock.mode;
  m.link = $('input[name=meLink]:checked')?.value || m.link;
  if ($('#meUnit')) m.stock.unit = $('#meUnit').value.trim();
  if ($('#meLow')) { const n = parseNum($('#meLow').value); m.stock.lowAt = Number.isFinite(n) ? n : 0; }
  $$('.mePart').forEach(inp => { m.stock.parts[+inp.dataset.i].label = inp.value.trim(); });
  $$('.fe-row').forEach(row => {
    const f = m.fields[+row.dataset.i];
    f.label = $('.fe-label', row).value.trim();
    if (f.key !== 'name') {
      f.type = $('.fe-type', row).value;
      f.inList = !!$('.fe-inlist', row)?.checked;
      f.required = !!$('.fe-req', row)?.checked && !['checkbox', 'file'].includes(f.type);
    }
    f.expiry = f.type === 'date' && !!$('.fe-exp', row)?.checked;
    f.help = $('.fe-help', row).value.trim();
    if ($('.fe-opts', row)) f.options = $('.fe-opts', row).value.split('\n').map(s => s.trim()).filter(Boolean);
    if ($('.fe-cols', row)) f.columns = $('.fe-cols', row).value.split(',').map(s => s.trim()).filter(Boolean);
    if (['richtext', 'table', 'file'].includes(f.type)) f.inList = false;
  });
}
const redrawME = fn => { syncModForm(); fn(App.modForm); App.dirty = true; drawModuleEditor(); };
ACT.mePartAdd = () => redrawME(m => m.stock.parts.push({ key: '', label: '' }));
ACT.mePartDel = el => {
  const m = App.modForm, p = m.stock.parts[+el.dataset.i];
  const used = p.key && recordsOf(m.id).some(r => Number(r.parts?.[p.key] || 0) > 0);
  if (used && !confirm(`Some items still have “${p.label}” samples. If you remove this part, those counts are hidden. Continue?`)) return;
  redrawME(m2 => m2.stock.parts.splice(+el.dataset.i, 1));
};
ACT.meFieldAdd = () => {
  redrawME(m => m.fields.push({ ...F('', 'New field', 'text'), id: newId(), isNew: true }));
  const rows = $$('.fe-row'); const inp = $('.fe-label', rows[rows.length - 1]); inp?.focus(); inp?.select();
};
ACT.meFieldMove = el => redrawME(m => {
  const vis = m.fields.map((f, i) => i).filter(i => !m.fields[i].hidden);
  const pos = vis.indexOf(+el.dataset.i), other = vis[pos + Number(el.dataset.d)];
  if (other == null) return;
  [m.fields[+el.dataset.i], m.fields[other]] = [m.fields[other], m.fields[+el.dataset.i]];
});
ACT.meFieldHide = el => redrawME(m => { const f = m.fields[+el.dataset.i]; if (f.isNew) m.fields.splice(+el.dataset.i, 1); else f.hidden = true; });
ACT.meFieldRestore = el => redrawME(m => { m.fields[+el.dataset.i].hidden = false; });

ACT.saveModule = async btn => {
  syncModForm();
  const m = App.modForm;
  if (!m.name) { toast('Give the module a name.', 'warn'); $('#meName').focus(); return; }
  if (App.modules.some(x => x.id !== m.id && x.name.toLowerCase() === m.name.toLowerCase())) { toast('Another module already has this name.', 'warn'); return; }
  if (m.fields.some(f => !f.hidden && !f.label)) { toast('Every field needs a name.', 'warn'); return; }
  if (m.fields.some(f => !f.hidden && f.type === 'multiselect' && !(f.options || []).length)) { toast('Checklist fields need at least one choice.', 'warn'); return; }
  if (m.stock.mode === 'parts') {
    if (!m.stock.parts.length || m.stock.parts.some(p => !p.label)) { toast('Every part needs a name.', 'warn'); return; }
    const keys = m.stock.parts.filter(p => p.key).map(p => p.key);
    m.stock.parts.forEach(p => { if (!p.key) { p.key = keyFromLabel(p.label, keys); keys.push(p.key); } });
  }
  if (m.stock.mode === 'none' && m.link === 'consume') m.link = 'reference';
  const keys = m.fields.filter(f => f.key).map(f => f.key);
  m.fields.forEach(f => { if (!f.key) { f.key = keyFromLabel(f.label, keys); keys.push(f.key); } delete f.isNew; });
  const isNew = !!m.isNew;
  delete m.isNew;
  m.singular = m.singular || m.name;
  m.version = (m.version || 0) + 1;
  m.updatedAt = Date.now();
  if (isNew) m.createdAt = Date.now();
  btn.disabled = true;
  try {
    await App.store.put('modules', m.id, m);
    await logChange(`${isNew ? 'Created' : 'Updated'} module “${m.name}”`);
    App.dirty = false; App.modForm = null;
    toast(isNew ? 'Module created.' : 'Module saved.');
    go(isNew ? `#/m/${m.id}` : '#/admin/modules');
  } catch (err) { toast(errorMessage(err), 'bad'); btn.disabled = false; m.isNew = isNew; }
};
ACT.archiveModule = async () => {
  const m = App.modForm;
  if (!await confirmDialog(`Archive “${m.name}”?`, 'It disappears from the sidebar and from experiments. Items and past experiments are kept. You can restore it any time.', { confirmText: 'Archive' })) return;
  await App.store.patch('modules', m.id, { archived: true });
  await logChange(`Archived module “${m.name}”`);
  App.dirty = false; App.modForm = null; go('#/admin/modules');
};

/* ── People ─────────────────────────────────────────────────────────────── */
VIEWS.people = {
  render() {
    setPage('People', [{ label: 'Lab admin' }, { label: 'People' }]);
    const demo = App.store.mode === 'demo';
    const memberEmails = new Set(App.members.map(m => (m.email || '').toLowerCase()));
    const pending = App.invites.filter(i => !memberEmails.has(i.id));
    const admins = App.members.filter(m => m.role === 'admin').length;
    $('#main').innerHTML = `<div class="page narrow">
      <header class="page-head"><div><h1>People</h1><p class="sub">Who can use this inventory, and what they may do.</p></div></header>
      ${demo ? '<div class="notice">In demo mode you are the only user. Inviting people works once the app is connected to your lab’s Firebase project.</div>' : ''}
      <dl class="roles"><div><dt>Admin</dt><dd>Everything, including modules, people and settings.</dd></div>
        <div><dt>Member</dt><dd>Adds and edits items, experiments and projects.</dd></div>
        <div><dt>Viewer</dt><dd>Can look, but cannot change anything.</dd></div></dl>
      ${demo ? '' : `<section class="panel"><header class="panel-head"><h2>Invite someone</h2></header><form id="invForm" class="panel-body form-row">
        <label class="field grow"><span>Email</span><input id="invEmail" type="email" required placeholder="name@institute.org"></label>
        <label class="field"><span>Role</span><select id="invRole"><option value="member">Member</option><option value="viewer">Viewer</option><option value="admin">Admin</option></select></label>
        <button class="btn primary">Invite</button></form>
        <p class="panel-body muted small">Then send them the address of this page. They create an account with exactly this email, confirm it, and are let in automatically.</p></section>`}
      <section class="panel flush"><header class="panel-head"><h2>Members</h2><span class="muted small">${plural(App.members.length, 'person', 'people')}</span></header>
        <div class="tbl-scroll"><table class="tbl"><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Joined</th><th></th></tr></thead><tbody>
        ${App.members.sort((a, b) => (a.name || '').localeCompare(b.name || '')).map(m => {
          const self = m.id === App.user.uid, lastAdmin = m.role === 'admin' && admins <= 1;
          return `<tr><td class="name">${esc(m.name)}${self ? ' <span class="muted small">(you)</span>' : ''}</td><td>${esc(m.email || '—')}</td>
            <td><select data-member="${m.id}" aria-label="Role of ${esc(m.name)}"${lastAdmin || demo ? ' disabled' : ''}>${['admin', 'member', 'viewer'].map(r => `<option value="${r}"${m.role === r ? ' selected' : ''}>${roleLabel(r).split(' ')[0]}</option>`).join('')}</select></td>
            <td class="nowrap">${esc(fmtDate(m.joinedAt ? new Date(m.joinedAt).toISOString().slice(0, 10) : ''))}</td>
            <td class="r">${self || demo ? '' : `<button class="btn sm danger ghost" data-act="removeMember" data-id="${m.id}"${lastAdmin ? ' disabled' : ''}>Remove</button>`}</td></tr>`;
        }).join('')}</tbody></table></div></section>
      ${pending.length ? `<section class="panel flush"><header class="panel-head"><h2>Invited, not joined yet</h2></header><table class="tbl"><tbody>
        ${pending.map(i => `<tr><td>${esc(i.id)}</td><td>${esc(roleLabel(i.role).split(' ')[0])}</td><td class="muted small">invited by ${esc(i.invitedBy || '?')}</td>
          <td class="r"><button class="btn sm ghost" data-act="revokeInvite" data-id="${esc(i.id)}">Cancel invite</button></td></tr>`).join('')}</tbody></table></section>` : ''}
    </div>`;
    $('#invForm')?.addEventListener('submit', async e => {
      e.preventDefault();
      const email = $('#invEmail').value.trim().toLowerCase(), r = $('#invRole').value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { toast('Enter a valid email address.', 'warn'); return; }
      try { await App.store.put('invites', email, { role: r, invitedBy: me(), invitedAt: Date.now() }); await logChange(`Invited ${email} as ${r}`); toast(`Invited ${email}.`); $('#invEmail').value = ''; }
      catch (err) { toast(errorMessage(err), 'bad'); }
    });
    $$('select[data-member]').forEach(s => s.addEventListener('change', async () => {
      const m = App.members.find(x => x.id === s.dataset.member);
      if (m.id === App.user.uid && s.value !== 'admin' && !confirm('You will lose admin rights. Continue?')) { s.value = m.role; return; }
      try {
        await App.store.patch('members', m.id, { role: s.value });
        if (m.email) await App.store.patch('invites', m.email, { role: s.value }).catch(() => {});
        await logChange(`Changed ${m.name}'s role to ${s.value}`); toast('Role changed.');
      } catch (err) { toast(errorMessage(err), 'bad'); s.value = m.role; }
    }));
  }
};
ACT.removeMember = async el => {
  const m = App.members.find(x => x.id === el.dataset.id);
  if (!await confirmDialog(`Remove ${m.name}?`, 'They lose access right away. Their past experiments and changes stay.', { confirmText: 'Remove' })) return;
  await App.store.del('members', m.id);
  if (m.email) await App.store.del('invites', m.email).catch(() => {});
  await logChange(`Removed ${m.name} from the lab`);
};
ACT.revokeInvite = async el => { await App.store.del('invites', el.dataset.id); await logChange(`Cancelled the invite for ${el.dataset.id}`); };

/* ── Lab settings, backup and import ────────────────────────────────────── */
VIEWS.settings = {
  render() {
    setPage('Lab settings', [{ label: 'Lab admin' }, { label: 'Lab settings' }]);
    const demo = App.store.mode === 'demo';
    $('#main').innerHTML = `<div class="page narrow">
      <header class="page-head"><div><h1>Lab settings</h1></div></header>
      <section class="panel"><header class="panel-head"><h2>Lab name</h2></header><form id="labForm" class="panel-body form-row">
        <label class="field grow"><span>Name shown in the sidebar</span><input id="labName" value="${esc(App.lab?.name || '')}" required></label><button class="btn">Save</button></form></section>

      <section class="panel"><header class="panel-head"><h2>Backup</h2></header><div class="panel-body stack">
        <p>Download everything — modules, items, experiments, projects and the activity log — as one JSON file. Keep it on a lab drive. Do this at least once a month and before big changes.</p>
        <div class="row"><button class="btn primary" data-act="downloadBackup">Download backup</button>
          <label class="btn ghost">Restore from a backup<input type="file" accept=".json,application/json" id="restoreFile" hidden></label></div>
        <p class="muted small">Restoring adds or overwrites the records in the file. It does not delete anything else.</p></div></section>

      <section class="panel"><header class="panel-head"><h2>Import from the original Lab Inventory</h2></header><div class="panel-body stack">
        <p>Bring over data from the old app. In the old app, open the <i>Backup</i> tab and click “Download full backup (.json)”. Then choose that file here.</p>
        <p class="muted small">This only <b>reads</b> the file. Your original inventory and its Firebase project are not changed in any way.</p>
        <div class="row"><label class="btn">Choose old backup file<input type="file" accept=".json,application/json" id="oldFile" hidden></label></div></div></section>

      <section class="panel"><header class="panel-head"><h2>Connection</h2></header><div class="panel-body">
        ${demo ? `<p>The app is running in <b>demo mode</b>. Data is saved only in this browser. To use it for your lab, add your Firebase settings to <code>config.js</code> (see the setup guide).</p>
          <div class="row"><button class="btn danger ghost" data-act="resetDemo">Delete all demo data</button></div>`
        : `<p>Connected to Firebase project <code>${esc(App.config.firebase?.projectId || '')}</code>. File attachments: ${App.store.hasFileStorage ? 'Firebase Storage' : 'saved inside records (small files only)'}. Low-stock emails: ${App.config.emailjs?.serviceId ? 'on (EmailJS)' : 'off'}.</p>`}
      </div></section>
    </div>`;
    $('#labForm').addEventListener('submit', async e => {
      e.preventDefault();
      try { await App.store.patch('meta', 'lab', { name: $('#labName').value.trim() }); App.lab = { ...App.lab, name: $('#labName').value.trim() }; renderSidebar(); toast('Lab name saved.'); }
      catch (err) { toast(errorMessage(err), 'bad'); }
    });
    $('#restoreFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) readJson(f).then(restoreBackup).catch(err => toast(errorMessage(err), 'bad')); });
    $('#oldFile').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) readJson(f).then(previewOldImport).catch(err => toast(errorMessage(err), 'bad')); });
  }
};
ACT.resetDemo = async () => { if (await confirmDialog('Delete all demo data?', 'Everything you entered in demo mode in this browser is removed.')) App.store.resetDemo(); };
const readJson = file => file.text().then(t => { try { return JSON.parse(t); } catch (_) { throw new Error('This file is not valid JSON.'); } });

ACT.downloadBackup = () => {
  const cols = ['meta', 'modules', 'records', 'experiments', 'projects', 'log', 'members', 'invites'];
  const data = { backupType: 'lab-inventory-modular-backup', backupVersion: 1, exportedAt: new Date().toISOString(), exportedBy: me(), lab: App.lab?.name || '', collections: {} };
  cols.forEach(c => { data.collections[c] = c === 'meta' ? (App.lab ? [App.lab] : []) : App[c]; });
  downloadBlob(`${fileStem(App.lab?.name || 'lab')}_backup_${new Date().toISOString().replace(/[:.]/g, '-')}.json`, new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
  toast('Backup downloaded.');
};

async function restoreBackup(json) {
  if (json?.backupType !== 'lab-inventory-modular-backup') {
    if (json?.backupType === 'lab-inventory-full-backup') { previewOldImport(json); return; }
    throw new Error('This is not a backup from this app.');
  }
  const c = json.collections || {};
  const n = k => (c[k] || []).length;
  if (!await confirmDialog('Restore this backup?', `It contains ${n('modules')} modules, ${n('records')} items, ${n('experiments')} experiments and ${n('projects')} projects from ${esc(fmtTs(Date.parse(json.exportedAt)))}. Records with the same ID are overwritten.`, { confirmText: 'Restore', danger: false })) return;
  const ops = [];
  ['modules', 'records', 'experiments', 'projects'].forEach(col => (c[col] || []).forEach(d => ops.push(['set', col, d.id, d])));
  await App.store.batch(ops);
  await logChange(`Restored a backup (${ops.length} records)`);
  toast(`Restored ${ops.length} records.`);
}

/* Importer for the original single-lab app's backup file. */
function previewOldImport(json) {
  if (json?.backupType !== 'lab-inventory-full-backup' || !json.collections) {
    if (json?.backupType === 'lab-inventory-modular-backup') { restoreBackup(json); return; }
    toast('This is not a backup from the original Lab Inventory. In the old app, use Backup → “Download full backup (.json)”.', 'bad'); return;
  }
  const plan = buildOldImport(json);
  const already = App.records.filter(r => r.importedFrom).length;
  openModal({
    title: 'Import from the original Lab Inventory', wide: true,
    body: `<p class="lead">Found in the file (exported ${esc(fmtTs(Date.parse(json.exportedAt)))}${json.exportedBy ? ' by ' + esc(json.exportedBy) : ''}):</p>
      <table class="tbl compact"><tbody>${plan.summary.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="r num">${fmtNum(v)}</td></tr>`).join('')}</tbody></table>
      ${plan.newModules.length ? `<p>These modules will be created: ${plan.newModules.map(m => tapeLabel(m, true)).join(' ')}</p>` : ''}
      ${plan.warnings.length ? `<div class="notice warn">${plan.warnings.map(esc).join('<br>')}</div>` : ''}
      ${already ? `<div class="notice warn">${plural(already, 'item')} were imported before. Importing again creates duplicates.</div>` : ''}
      <p class="muted small">Stock numbers are copied as they are. Experiments keep their items, but stock is not subtracted again. Your original inventory is not changed.</p>`,
    actions: [{ label: 'Cancel', kind: 'ghost' }, {
      label: 'Import', kind: 'primary', onClick: async close => {
        await App.store.batch(plan.newModules.map(m => ['set', 'modules', m.id, m]));
        await App.store.batch(plan.ops);
        await logChange(`Imported ${plural(plan.ops.length, 'record')} from the original Lab Inventory`);
        close(); toast(`Imported ${plural(plan.ops.length, 'record')}.`);
      }
    }]
  });
}

function buildOldImport(json) {
  const c = json.collections;
  const newModules = [], warnings = [], ops = [];
  let order = App.modules.length;
  const modFor = tid => {
    let m = App.modules.find(x => x.tid === tid && !x.archived) || App.modules.find(x => x.tid === tid) || newModules.find(x => x.tid === tid);
    if (!m) { m = moduleFromTemplate(TEMPLATES.find(t => t.tid === tid), order++); newModules.push(m); }
    return m;
  };
  const cap = s => s ? String(s)[0].toUpperCase() + String(s).slice(1) : '';
  const n0 = v => (v === 0 || v === '0' || v == null) ? '' : v;
  const files = links => (links || []).map(l => typeof l === 'string' ? { name: l, url: l } : { name: l.name, size: l.size, type: l.mimeType, ...(l.url ? { url: l.url } : {}), ...(l.dataUrl ? { dataUrl: l.dataUrl } : {}) }).filter(f => f.url || f.dataUrl);
  const ts = s => { const t = Date.parse(s); return Number.isFinite(t) ? t : Date.now(); };
  const idMap = new Map(); // "type:oldId" -> new record
  const remember = (type, old, rec) => { [old.id, old._docId].filter(Boolean).forEach(k => idMap.set(`${type}:${k}`, rec)); };
  const record = (mod, old, data, extra = {}) => ({ id: newId(), moduleId: mod.id, data, createdAt: Number(old.id) > 1e11 ? Number(old.id) : Date.now(), createdBy: old.createdBy || old.addedBy || 'Import',
    updatedAt: Date.now(), updatedBy: me(), importedFrom: String(old.id || old._docId || ''), log: [], ...extra });
  const oldLog = list => (list || []).slice(0, 30).map(l => ({ ts: ts(l.ts), user: l.user || '', amount: Number(l.amount) || 0,
    action: { consume: 'use', add: 'add', restore: 'release', relocate: 'edit' }[l.action] || 'edit', note: l.action === 'relocate' ? `moved to ${l.note || '?'}` : (l.note || '') }));
  const hazardMap = { Irritant: 'Irritant / harmful' };

  (c.materials || []).forEach(m => {
    const cat = m.category || 'Other';
    const base = { stock: Number(m.stock) || 0, unit: m.unit || '', lowAt: Number(m.lowAt ?? 1), log: oldLog(m.log) };
    let mod, data;
    if (cat === 'Antibody') {
      mod = modFor('antibodies');
      data = { name: m.name, purpose: m.abPurpose || '', conjugate: m.abConjugate || '', clone: m.abClone || '', reactivity: m.abReactivity || '', host: m.abHost || '',
        clonality: m.abClonality ? cap(m.abClonality) : '', company: m.company || '', catalog: m.catalog || '', lot: m.abLot || '', dilution: m.abDilution || '',
        retrieval: m.abRetrieval || '', status: m.abStatus || '', panel: m.abSource || '', synonym: m.abSynonym || '', location: m.location || '',
        delivered: m.arrival || '', expiry: m.expiry || '', link: m.link || '', flag: cap(m.colorCode), notes: m.notes || '', files: files(m.driveLinks) };
    } else if (cat === 'Kit') {
      mod = modFor('kits');
      data = { name: m.name, company: m.company || '', catalog: m.catalog || '', lot: m.abLot || '', location: m.location || '', delivered: m.arrival || '', expiry: m.expiry || '',
        link: m.link || '', flag: cap(m.colorCode), notes: m.notes || '', files: files(m.driveLinks) };
    } else if (cat === 'Primer') {
      mod = modFor('primers');
      data = { name: m.name, sequence: m.priSequence || '', orientation: m.priOrientation === 'Both' ? 'Probe' : (m.priOrientation || ''), application: m.priApplication || '',
        stockConc: n0(m.priStockConc), workConc: n0(m.priWorkConc), tm: n0(m.priTm), location: m.location || '', notes: m.notes || '' };
      base.stock = Number(m.priVolume || m.stock) || 0; base.unit = 'µL';
    } else if (cat === 'Plasmid') {
      mod = modFor('plasmids');
      data = { name: m.name, plasmidId: m.plaId || '', backbone: m.plaBackbone || '', vectorType: m.plaVectype || '', insert: m.plaInsert || '', insertSize: n0(m.plaInsertSize),
        promoter: m.plaPromoter || '', resistance: m.plaResistance || '', selection: m.plaSelection || '', concentration: m.plaConc || '', addgeneId: m.plaAddgeneId || '',
        receivedFrom: m.plaFrom || '', addgeneLink: m.plaLinkAddgene || '', benchlingLink: m.plaLinkBenchling || '', hostCells: m.plaCelllines || '',
        location: m.location || '', notes: m.notes || '', files: files(m.driveLinks) };
    } else {
      mod = modFor('reagents');
      const known = ['Reagent', 'Medium'].includes(cat);
      data = { name: m.name, type: known ? cat : 'Other', company: m.company || '', catalog: m.catalog || '', size: m.size || '', location: m.location || '',
        delivered: m.arrival || '', opened: m.opened || '', expiry: m.expiry || '', hazards: (Array.isArray(m.hazard) ? m.hazard : m.hazard ? [m.hazard] : []).map(h => hazardMap[h] || h),
        link: m.link || '', flag: cap(m.colorCode), notes: [known ? '' : `Category in old app: ${cat}`, m.notes || ''].filter(Boolean).join('\n'), files: files(m.driveLinks) };
    }
    const rec = record(mod, m, data, base);
    remember('material', m, rec); ops.push(['set', 'records', rec.id, rec]);
  });
  (c.celllines || []).forEach(cl => {
    const mod = modFor('celllines');
    const rec = record(mod, cl, { name: cl.name, passage: n0(cl.passage) === '' ? '' : Number(cl.passage), frozen: cl.frozen || '', location: cl.location || '', origin: cl.origin || '', notes: cl.notes || '', files: files(cl.driveLinks) },
      { stock: Number(cl.vials) || 0, unit: 'vials', lowAt: mod.stock.lowAt });
    remember('cellline', cl, rec); ops.push(['set', 'records', rec.id, rec]);
  });
  (c.pdxmodels || []).forEach(p => {
    const mod = modFor('mice');
    const notes = [p.notes || '', (p.vials || []).length ? 'Freezer vials:\n' + p.vials.map(v => '• ' + v).join('\n') : ''].filter(Boolean).join('\n\n');
    const parts = {}; Object.entries(p.tissues || {}).forEach(([k, v]) => { if (Number(v) > 0) parts[k] = Number(v); });
    const rec = record(mod, p, { name: String(p.miceId || p.name || '').replace(/^#/, ''), model: p.model || p.origName || '', year: n0(p.year) === '' ? '' : Number(p.year) || p.year, location: p.location || '', notes, files: files(p.driveLinks) },
      { parts, unit: 'pcs' });
    remember('pdx', p, rec); ops.push(['set', 'records', rec.id, rec]);
  });
  (c.protocols || []).forEach(pr => {
    const mod = modFor('protocols');
    const blocks = Array.isArray(pr.blocks) && pr.blocks.length ? pr.blocks : [];
    let html = blocks.map(b => b.type === 'table'
      ? `<h3>${esc(b.title || 'Table')}</h3><table><thead><tr>${(b.columns || []).map(x => `<th>${esc(x)}</th>`).join('')}</tr></thead><tbody>${(b.rows || []).map(r => `<tr>${(b.columns || []).map((_, i) => `<td>${sanitizeHtml(r?.[i] || '')}</td>`).join('')}</tr>`).join('')}</tbody></table>`
      : `<h3>${esc(b.title || '')}</h3>${sanitizeHtml(b.html || '')}`).join('');
    if (!blocks.length) html = [pr.steps ? sanitizeHtml(pr.steps) : '', pr.notes ? `<h3>Notes</h3><p>${esc(pr.notes)}</p>` : ''].join('');
    const rec = record(mod, pr, { name: pr.name, version: pr.version || '', summary: pr.summary || pr.purpose || '',
      materials: (pr.materials || []).map(x => [x.name || '', String(x.amount ?? ''), x.unit || '', x.notes || '']), procedure: sanitizeHtml(html), files: [] });
    remember('protocol', pr, rec); ops.push(['set', 'records', rec.id, rec]);
  });
  if ((c.tissues || []).length) warnings.push(`${plural(c.tissues.length, 'old tissue sample')} from the retired “Tissues” list are not imported.`);

  const projMap = new Map();
  (c.projects || []).forEach(p => {
    const id = newId(); projMap.set(String(p.id), id); if (p._docId) projMap.set(String(p._docId), id);
    const links = [...(p.materialIds || []).map(x => idMap.get(`material:${x}`)), ...(p.celllineIds || []).map(x => idMap.get(`cellline:${x}`))].filter(Boolean).map(r => r.id);
    const miceMod = [...newModules, ...App.modules].find(m => m.tid === 'mice');
    (p.pdxIds || []).forEach(model => ops.forEach(([, col, , r]) => {
      if (miceMod && col === 'records' && r.moduleId === miceMod.id && (r.data?.model === model || r.importedFrom === String(model))) links.push(r.id);
    }));
    ops.push(['set', 'projects', id, { id, name: p.name, desc: p.desc || '', links: [...new Set(links)], createdAt: Date.now(), createdBy: p.createdBy || 'Import', importedFrom: String(p.id || '') }]);
  });
  let lostItems = 0;
  (c.experiments || []).forEach(e => {
    const items = [], lost = [];
    const oldItems = Array.isArray(e.items) ? e.items : (e.materials || []).map(m => ({ type: 'material', ...m }));
    oldItems.forEach(it => {
      const rec = it.type === 'material' ? idMap.get(`material:${it.id}`) : it.type === 'cellline' ? idMap.get(`cellline:${it.id}`) : it.type === 'pdxtissue' ? idMap.get(`pdx:${it.id}`) : null;
      if (!rec) { lost.push(`${it.name || it.id} (${it.amount ?? ''} ${it.unit || ''})`); return; }
      const mod = App.modules.find(m => m.id === rec.moduleId) || newModules.find(m => m.id === rec.moduleId);
      const part = it.type === 'pdxtissue' ? it.sub : '';
      items.push({ recordId: rec.id, moduleId: rec.moduleId, part, name: rec.data.name + (part ? ` — ${partLabel(mod, part)}` : ''), unit: it.unit || rec.unit || '', amount: Number(it.amount) || 0 });
    });
    lostItems += lost.length;
    const status = e.status || 'final';
    const reserved = e.stockReserved === true || status === 'final';
    const refs = (e.protocolRefs || (e.protocolIds || []).map(id => ({ id }))).map(r => idMap.get(`protocol:${r.id}`)).filter(Boolean)
      .map(r => ({ recordId: r.id, moduleId: r.moduleId, name: r.data.name }));
    const notes = [e.notes || '', lost.length ? `Items not found during import: ${lost.join('; ')}` : '', htmlToText(e.protocol) ? `Protocol / method (old record): ${htmlToText(e.protocol)}` : ''].filter(Boolean).join('\n\n');
    const id = newId();
    const norm = normalizeItems(items);
    ops.push(['set', 'experiments', id, { id, title: e.title || 'Untitled', date: e.date || '', user: e.user || e.createdBy || '', projectId: projMap.get(String(e.projectId)) || '',
      aim: e.aim || '', items: norm, refs, result: sanitizeHtml(e.result || ''), next: sanitizeHtml(e.next || ''), notes, files: files(e.driveLinks), status,
      stockReserved: reserved, reservedItems: reserved ? norm : [], createdAt: e.createdAt || Date.now(), createdBy: e.createdBy || e.user || 'Import',
      createdByEmail: e.createdByEmail || '', finalizedAt: e.finalizedAt || null, importedFrom: String(e.id || '') }]);
  });
  if (lostItems) warnings.push(`${plural(lostItems, 'experiment item')} could not be matched to an imported record. They are written into the experiment notes instead.`);
  const count = col => ops.filter(o => o[1] === col).length;
  const summary = [['Materials (antibodies, reagents, kits, primers, plasmids)', (c.materials || []).length], ['Cell lines', (c.celllines || []).length],
    ['Mice / PDX', (c.pdxmodels || []).length], ['Protocols', (c.protocols || []).length], ['Projects', count('projects')], ['Experiments', count('experiments')]];
  return { ops, newModules, warnings, summary };
}
