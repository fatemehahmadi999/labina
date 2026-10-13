/* ──────────────────────────────────────────────────────────────────────────
   records.js — field inputs and display, module pages (tables), the record
   side panel, stock changes, attachments, rich text and table fields.
   ────────────────────────────────────────────────────────────────────────── */

/* ── Field inputs ───────────────────────────────────────────────────────── */
const FILE_STATE = {}; // inputId -> { existing: [], pending: [], removed: [] }

function fieldInput(f, value, prefix, mod = null) {
  const id = `${prefix}-${f.key}`;
  const req = f.required ? ' <span class="req" aria-hidden="true">*</span>' : '';
  const label = `<span>${esc(f.label)}${req}</span>`;
  const help = f.help ? `<small class="help">${esc(f.help)}</small>` : '';
  const v = value ?? '';
  const block = (inner, extra = '') => `<div class="field ${extra}" data-key="${esc(f.key)}">${label}${inner}${help}</div>`;
  switch (f.type) {
    case 'textarea': return `<label class="field wide">${label}<textarea id="${id}" rows="3">${esc(v)}</textarea>${help}</label>`;
    case 'sequence': return `<label class="field wide">${label}<textarea id="${id}" class="mono" rows="2" spellcheck="false">${esc(v)}</textarea>${help}</label>`;
    case 'number': return `<label class="field">${label}<input id="${id}" inputmode="decimal" autocomplete="off" value="${esc(v)}">${help}</label>`;
    case 'date': return `<label class="field">${label}<input id="${id}" type="date" value="${esc(v)}">${help}</label>`;
    case 'url': return `<label class="field">${label}<input id="${id}" type="url" placeholder="https://…" value="${esc(v)}">${help}</label>`;
    case 'select': {
      // Choices = the module's preset choices + every value already used by items of this module.
      const used = mod ? recordsOf(mod.id).map(r => r.data?.[f.key]).filter(x => typeof x === 'string' && x.trim()) : [];
      const preset = f.options || [];
      const extra = [...new Set([...used, ...(v ? [v] : [])])].filter(x => !preset.includes(x)).sort((a, b) => a.localeCompare(b));
      const opts = [...preset, ...extra];
      const canAdd = mod && canEdit();
      const word = esc(f.label.toLowerCase());
      return `<div class="field">${label}<select id="${id}"${canAdd ? ' data-addnew' : ''} aria-label="${esc(f.label)}"><option value="">—</option>${opts.map(o => `<option${o === v ? ' selected' : ''}>${esc(o)}</option>`).join('')}
        ${canAdd ? `<option value="__new__">+ Add a new ${word}…</option>` : ''}</select>
        ${canAdd ? `<input id="${id}-new" hidden placeholder="Type the new ${word}" aria-label="New ${word}">` : ''}${help}</div>`;
    }
    case 'multiselect': {
      const cur = Array.isArray(v) ? v : (v ? [v] : []);
      const opts = [...new Set([...(f.options || []), ...cur])];
      return block(`<div class="checks" id="${id}">${opts.map(o => `<label class="check"><input type="checkbox" value="${esc(o)}"${cur.includes(o) ? ' checked' : ''}>${esc(o)}</label>`).join('')}</div>`, 'wide');
    }
    case 'checkbox': return `<label class="field check-field"><span class="check"><input id="${id}" type="checkbox"${v ? ' checked' : ''}>${esc(f.label)}</span>${help}</label>`;
    case 'richtext': return block(richEditor(id, v), 'wide');
    case 'table': return block(tableEditor(id, f.columns || [], Array.isArray(v) ? v : []), 'wide');
    case 'file': return block(fileInput(id, Array.isArray(v) ? v : []), 'wide');
    default: return `<label class="field">${label}<input id="${id}" autocomplete="off" value="${esc(v)}">${help}</label>`;
  }
}

function readField(f, prefix) {
  const id = `${prefix}-${f.key}`;
  const el = document.getElementById(id);
  if (!el) return undefined;
  switch (f.type) {
    case 'number': {
      const raw = el.value.trim();
      if (!raw) return '';
      const n = parseNum(raw);
      if (!Number.isFinite(n)) throw new Error(`“${f.label}” must be a number.`);
      return n;
    }
    case 'multiselect': return $$('input:checked', el).map(i => i.value);
    case 'checkbox': return el.checked;
    case 'select': {
      if (el.value !== '__new__') return el.value;
      const nv = (document.getElementById(id + '-new')?.value || '').trim();
      if (!nv) throw new Error(`Type the new ${f.label.toLowerCase()}, or pick one from the list.`);
      return nv;
    }
    case 'richtext': { const h = sanitizeHtml(el.innerHTML); return htmlToText(h) || /<table/i.test(h) ? h : ''; }
    case 'table': return readTable(id);
    case 'sequence': return el.value.replace(/\s+/g, '').toUpperCase();
    case 'file': return null; // handled by finalizeFiles
    default: return el.value.trim();
  }
}
const isEmptyValue = v => v === '' || v == null || (Array.isArray(v) && !v.length) || v === false;

/* Rich text editor */
function richEditor(id, html) {
  const b = (cmd, label, title) => `<button type="button" class="rte-btn" data-act="rte" data-cmd="${cmd}" data-target="${id}" title="${title}">${label}</button>`;
  return `<div class="rte">
    <div class="rte-bar">${b('bold', '<b>B</b>', 'Bold')}${b('italic', '<i>I</i>', 'Italic')}${b('underline', '<u>U</u>', 'Underline')}
      <span class="rte-sep"></span>${b('h3', 'Heading', 'Heading')}${b('insertUnorderedList', '• List', 'Bullet list')}${b('insertOrderedList', '1. List', 'Numbered list')}
      <span class="rte-sep"></span>${b('link', 'Link', 'Insert link')}${b('removeFormat', 'Clear', 'Clear formatting')}</div>
    <div class="rte-body prose" id="${id}" contenteditable="true" role="textbox" aria-multiline="true">${sanitizeHtml(html)}</div></div>`;
}
document.addEventListener('mousedown', e => { if (e.target.closest('.rte-bar')) e.preventDefault(); });
document.addEventListener('change', e => {
  const sel = e.target.closest('select[data-addnew]');
  if (!sel) return;
  const inp = document.getElementById(sel.id + '-new');
  if (!inp) return;
  inp.hidden = sel.value !== '__new__';
  if (!inp.hidden) inp.focus();
});
ACT.rte = btn => {
  const el = document.getElementById(btn.dataset.target);
  if (!el) return;
  el.focus();
  const cmd = btn.dataset.cmd;
  if (cmd === 'link') { const url = prompt('Link address (https://…)'); if (url && safeUrl(url)) document.execCommand('createLink', false, safeUrl(url)); }
  else if (cmd === 'h3') document.execCommand('formatBlock', false, 'h3');
  else document.execCommand(cmd, false, null);
  markDirty();
};

/* Table editor (columns fixed by the field, rows added by users) */
function tableEditor(id, columns, rows) {
  const cols = columns.length ? columns : ['Column 1'];
  const row = r => `<tr>${cols.map((_, i) => `<td><input value="${esc(r?.[i] ?? '')}" aria-label="${esc(cols[i])}"></td>`).join('')}
    <td class="act"><button type="button" class="icon-btn sm" data-act="tblDelRow" title="Remove row" aria-label="Remove row">${ICON.x}</button></td></tr>`;
  return `<div class="tbl-edit" id="${id}" data-cols="${esc(JSON.stringify(cols))}">
    <div class="tbl-scroll"><table class="tbl compact"><thead><tr>${cols.map(c => `<th>${esc(c)}</th>`).join('')}<th></th></tr></thead>
    <tbody>${(rows.length ? rows : [[]]).map(row).join('')}</tbody></table></div>
    <button type="button" class="btn ghost sm" data-act="tblAddRow" data-target="${id}">${ICON.plus}Add row</button></div>`;
}
ACT.tblAddRow = btn => {
  const wrap = document.getElementById(btn.dataset.target);
  const cols = JSON.parse(wrap.dataset.cols);
  const tr = document.createElement('tr');
  tr.innerHTML = cols.map(c => `<td><input aria-label="${esc(c)}"></td>`).join('') + `<td class="act"><button type="button" class="icon-btn sm" data-act="tblDelRow" aria-label="Remove row">${ICON.x}</button></td>`;
  $('tbody', wrap).appendChild(tr);
  $('input', tr).focus();
  markDirty();
};
ACT.tblDelRow = btn => { btn.closest('tr').remove(); markDirty(); };
function readTable(id) {
  const wrap = document.getElementById(id);
  return $$('tbody tr', wrap).map(tr => $$('input', tr).map(i => i.value.trim())).filter(r => r.some(Boolean));
}

/* Attachments */
function fileInput(id, files) {
  FILE_STATE[id] = { existing: [...files], pending: [], removed: [] };
  return `<div class="files" id="${id}"><div class="file-list"></div>
    <label class="btn ghost sm file-pick">${ICON.plus}Attach files<input type="file" multiple data-file-target="${id}" hidden></label>
    <small class="help">${App.store.hasFileStorage ? 'Files are stored in your lab’s Firebase Storage.' : `Without Firebase Storage, files up to ${Math.round(App.store.maxEmbeddedFile / 1024)} KB are saved inside the record.`}</small></div>`;
}
function renderFileList(id) {
  const st = FILE_STATE[id], wrap = document.getElementById(id);
  if (!st || !wrap) return;
  $('.file-list', wrap).innerHTML = [
    ...st.existing.map((f, i) => `<div class="file-row">${ICON.file}<span class="grow">${esc(f.name)}</span><span class="muted small">${fmtBytes(f.size)}</span>
      <button type="button" class="icon-btn sm" data-act="fileRemove" data-target="${id}" data-kind="existing" data-i="${i}" aria-label="Remove ${esc(f.name)}">${ICON.x}</button></div>`),
    ...st.pending.map((f, i) => `<div class="file-row pending">${ICON.file}<span class="grow">${esc(f.name)}</span><span class="muted small">${fmtBytes(f.size)} · not saved yet</span>
      <button type="button" class="icon-btn sm" data-act="fileRemove" data-target="${id}" data-kind="pending" data-i="${i}" aria-label="Remove ${esc(f.name)}">${ICON.x}</button></div>`)
  ].join('');
}
document.addEventListener('change', e => {
  const inp = e.target.closest('input[data-file-target]');
  if (!inp) return;
  const st = FILE_STATE[inp.dataset.fileTarget];
  [...inp.files].forEach(f => { if (!st.pending.some(p => p.name === f.name && p.size === f.size)) st.pending.push(f); });
  inp.value = '';
  renderFileList(inp.dataset.fileTarget);
  markDirty();
});
ACT.fileRemove = btn => {
  const st = FILE_STATE[btn.dataset.target];
  if (btn.dataset.kind === 'existing') st.removed.push(...st.existing.splice(+btn.dataset.i, 1));
  else st.pending.splice(+btn.dataset.i, 1);
  renderFileList(btn.dataset.target);
  markDirty();
};
const fmtBytes = b => !b && b !== 0 ? '' : b < 1024 ? b + ' B' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB';
const fileToDataUrl = file => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(file); });

/* Upload pending files. Returns the final list of file entries for the field. */
async function finalizeFiles(id, pathBase) {
  const st = FILE_STATE[id];
  if (!st) return [];
  const out = [...st.existing];
  for (const file of st.pending) {
    const safe = Date.now() + '_' + file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    if (App.store.hasFileStorage) {
      try { out.push({ name: file.name, size: file.size, type: file.type, ...(await App.store.upload(file, `${pathBase}/${safe}`)) }); continue; }
      catch (err) { console.warn('Storage upload failed, trying to save inside the record:', err); }
    }
    if (file.size > App.store.maxEmbeddedFile) throw new Error(`“${file.name}” is ${fmtBytes(file.size)}. Without Firebase Storage the limit is ${fmtBytes(App.store.maxEmbeddedFile)}.`);
    out.push({ name: file.name, size: file.size, type: file.type, dataUrl: await fileToDataUrl(file) });
  }
  return out;
}
async function cleanupRemovedFiles(id) {
  const st = FILE_STATE[id];
  if (st) for (const f of st.removed) if (f.path) await App.store.removeFile(f.path);
}

/* ── Display values ─────────────────────────────────────────────────────── */
function fieldDisplay(f, v) {
  if (isEmptyValue(v) && f.type !== 'checkbox') return '';
  switch (f.type) {
    case 'textarea': return `<div class="pre">${esc(v)}</div>`;
    case 'number': return `<span class="num">${fmtNum(v)}</span>`;
    case 'date': {
      let badge = '';
      if (f.expiry) { const d = daysUntil(v); badge = d < 0 ? ' <span class="badge bad">Expired</span>' : d <= 30 ? ` <span class="badge warn">in ${d} d</span>` : ''; }
      return esc(fmtDate(v)) + badge;
    }
    case 'select': return flagChip(v) || esc(v);
    case 'multiselect': return (Array.isArray(v) ? v : [v]).map(x => `<span class="chip">${esc(x)}</span>`).join(' ');
    case 'checkbox': return v ? 'Yes' : 'No';
    case 'url': { const u = safeUrl(v); return u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(u.replace(/^https?:\/\//, '').slice(0, 60))}</a>` : esc(v); }
    case 'sequence': return `<div class="seq">${esc(v)}</div><small class="muted">${String(v).length} bases</small>`;
    case 'richtext': return `<div class="prose">${sanitizeHtml(v)}</div>`;
    case 'table': return `<div class="tbl-scroll"><table class="tbl compact"><thead><tr>${(f.columns || []).map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${v.map(r => `<tr>${(f.columns || []).map((_, i) => `<td>${esc(r[i] ?? '')}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    case 'file': return `<div class="file-list">${v.map(fl => {
      const href = fl.url || fl.dataUrl || '';
      return `<div class="file-row">${ICON.file}<span class="grow">${esc(fl.name)}</span><span class="muted small">${fmtBytes(fl.size)}</span>
        ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener">Open</a><a href="${esc(href)}" download="${esc(fl.name)}">Download</a>` : ''}</div>`;
    }).join('')}</div>`;
    default: return esc(v);
  }
}
function flagChip(v) {
  const t = Object.entries(TAPES).find(([, x]) => x.name.toLowerCase() === String(v).toLowerCase());
  return t ? `<span class="flag" style="--tb:${t[1].bg}"></span>${esc(v)}` : '';
}
function fieldPlain(f, v) {
  if (isEmptyValue(v)) return f.type === 'checkbox' ? 'No' : '';
  if (f.type === 'richtext') return htmlToText(v);
  if (f.type === 'table') return v.map(r => r.join(' | ')).join(' ; ');
  if (f.type === 'file') return v.map(x => x.name).join('; ');
  if (f.type === 'checkbox') return 'Yes';
  return Array.isArray(v) ? v.join('; ') : String(v);
}

/* ── Module page ────────────────────────────────────────────────────────── */
App.modUi = {};
function modUi(id) { return App.modUi[id] = App.modUi[id] || { q: '', sortKey: 'name', dir: 1, filterVal: '', stockFilter: '' }; }
const listFields = mod => visibleFields(mod).filter(f => f.inList && f.key !== 'name' && !['richtext', 'table', 'file'].includes(f.type)).slice(0, 5);
const filterField = mod => visibleFields(mod).find(f => f.inList && f.type === 'select');

function filteredRecords(mod) {
  const ui = modUi(mod.id);
  let recs = recordsOf(mod.id);
  const ff = filterField(mod);
  if (ff && ui.filterVal) recs = recs.filter(r => (r.data?.[ff.key] || '') === ui.filterVal);
  if (ui.stockFilter === 'attention') recs = recs.filter(r => ['low', 'out'].includes(stockState(r, mod)));
  if (ui.stockFilter === 'ok') recs = recs.filter(r => stockState(r, mod) === 'ok');
  const q = ui.q.trim().toLowerCase();
  if (q) {
    const byName = recs.filter(r => recName(r).toLowerCase().includes(q));
    recs = byName.length ? byName : recs.filter(r => recordSearchText(r).includes(q));
  }
  const f = visibleFields(mod).find(x => x.key === ui.sortKey);
  const val = r => ui.sortKey === '__stock' ? (mod.stock.mode === 'parts' ? partsTotal(r) : Number(r.stock || 0))
    : f?.type === 'number' ? Number(r.data?.[f.key] ?? -Infinity) : String(r.data?.[ui.sortKey] ?? '').toLowerCase();
  recs.sort((a, b) => { const x = val(a), y = val(b); return (x < y ? -1 : x > y ? 1 : 0) * ui.dir || recName(a).localeCompare(recName(b), undefined, { numeric: true }); });
  return recs;
}

VIEWS.module = {
  render(route) {
    const mod = modById(route.id);
    if (!mod || mod.archived) {
      setPage('Not found', []);
      $('#main').innerHTML = `<div class="page"><div class="empty-state"><h2>This module does not exist</h2><p>It may have been archived by an admin.</p><a class="btn" href="#/">Go to overview</a></div></div>`;
      return;
    }
    setPage(mod.name, [{ label: 'Inventory' }, { label: mod.name }]);
    const ui = modUi(mod.id);
    const ff = filterField(mod);
    const ffOptions = ff ? [...(ff.options || []), ...[...new Set(recordsOf(mod.id).map(r => r.data?.[ff.key]).filter(Boolean))].filter(x => !(ff.options || []).includes(x)).sort((a, b) => a.localeCompare(b))] : [];
    $('#main').innerHTML = `<div class="page">
      <header class="page-head">
        <div><h1 class="tape-title">${tapeLabel(mod)}</h1>${mod.description ? `<p class="sub">${esc(mod.description)}</p>` : ''}</div>
        <div class="actions">
          ${isAdmin() ? `<a class="btn ghost" href="#/admin/modules/${mod.id}">Edit module</a>` : ''}
          ${canEdit() ? `<button class="btn primary" data-act="newRecord" data-mod="${mod.id}">${ICON.plus}Add ${esc((mod.singular || 'item').toLowerCase())}</button>` : ''}
        </div>
      </header>
      <div class="toolbar">
        <label class="search-box">${ICON.search}<input id="modSearch" type="search" placeholder="Search ${esc(mod.name.toLowerCase())}" value="${esc(ui.q)}" aria-label="Search"></label>
        ${ff ? `<select id="modFilter" aria-label="${esc(ff.label)}"><option value="">All: ${esc(ff.label)}</option>${ffOptions.map(o => `<option${o === ui.filterVal ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>` : ''}
        ${mod.stock?.mode !== 'none' ? `<select id="modStock" aria-label="Stock"><option value="">Any stock level</option>
          <option value="attention"${ui.stockFilter === 'attention' ? ' selected' : ''}>Low or out of stock</option>
          <option value="ok"${ui.stockFilter === 'ok' ? ' selected' : ''}>In stock</option></select>` : ''}
        <span class="grow"></span><span id="modCount" class="muted small"></span>
      </div>
      <div id="bulkBar" class="bulk-bar" hidden></div>
      <div class="panel flush"><div class="tbl-scroll" id="modTable"></div></div>
    </div>`;
    $('#modSearch').addEventListener('input', e => { ui.q = e.target.value; renderModuleTable(mod); });
    $('#modFilter')?.addEventListener('change', e => { ui.filterVal = e.target.value; renderModuleTable(mod); });
    $('#modStock')?.addEventListener('change', e => { ui.stockFilter = e.target.value; renderModuleTable(mod); });
    renderModuleTable(mod);
  }
};

function renderModuleTable(mod) {
  const ui = modUi(mod.id);
  const recs = filteredRecords(mod);
  const cols = listFields(mod);
  const sel = App.sel[mod.id] = App.sel[mod.id] || new Set();
  [...sel].forEach(id => { if (!recById(id)) sel.delete(id); });
  const hasStock = mod.stock?.mode !== 'none';
  const th = (key, label, cls = '') => `<th class="sortable ${cls}${ui.sortKey === key ? ' sorted' : ''}" data-act="sortBy" data-key="${key}" data-mod="${mod.id}" aria-sort="${ui.sortKey === key ? (ui.dir > 0 ? 'ascending' : 'descending') : 'none'}">${esc(label)}${ui.sortKey === key ? (ui.dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const nameField = mod.fields.find(f => f.key === 'name');
  const total = recordsOf(mod.id).length;
  $('#modCount').textContent = recs.length === total ? plural(total, 'item') : `${fmtNum(recs.length)} of ${plural(total, 'item')}`;
  if (!total) {
    $('#modTable').innerHTML = `<div class="empty-state"><h2>No ${esc(mod.name.toLowerCase())} yet</h2>
      ${canEdit() ? `<p>Add the first ${esc((mod.singular || 'item').toLowerCase())} to start tracking it.</p><button class="btn primary" data-act="newRecord" data-mod="${mod.id}">${ICON.plus}Add ${esc((mod.singular || 'item').toLowerCase())}</button>` : '<p>Nothing has been added yet.</p>'}</div>`;
    renderBulkBar(mod); return;
  }
  const allSel = recs.length && recs.every(r => sel.has(r.id));
  $('#modTable').innerHTML = `<table class="tbl">
    <thead><tr><th class="sel"><input type="checkbox" data-act="selAll" data-mod="${mod.id}" aria-label="Select all shown"${allSel ? ' checked' : ''}></th>
      ${th('name', nameField?.label || 'Name')}${cols.map(f => th(f.key, f.label)).join('')}${hasStock ? th('__stock', 'Stock', 'r') : ''}</tr></thead>
    <tbody>${recs.map(r => {
      const st = stockState(r, mod);
      const stock = mod.stock?.mode === 'single'
        ? `<span class="num">${fmtNum(r.stock ?? 0)}</span> <span class="muted">${esc(recUnit(r, mod))}</span> ${st !== 'ok' ? stockBadge(st) : ''}`
        : mod.stock?.mode === 'parts' ? `<span class="num">${fmtNum(partsTotal(r))}</span> <span class="muted">${esc(recUnit(r, mod))}</span><div class="parts-mini">${partsSummary(r, mod)}</div>` : '';
      return `<tr class="click${sel.has(r.id) ? ' selected' : ''}" data-act="openRecord" data-id="${r.id}">
        <td class="sel"><input type="checkbox" data-act="selOne" data-mod="${mod.id}" data-id="${r.id}" aria-label="Select ${esc(recName(r))}"${sel.has(r.id) ? ' checked' : ''}></td>
        <td class="name">${flagFor(r, mod)}${esc(recName(r))}</td>
        ${cols.map(f => `<td class="${f.type === 'number' ? 'r num' : ''}${f.type === 'sequence' ? ' seq-cell' : ''}">${f.type === 'sequence' ? esc(String(r.data?.[f.key] || '').slice(0, 28)) + (String(r.data?.[f.key] || '').length > 28 ? '…' : '') : fieldDisplay(f, r.data?.[f.key])}</td>`).join('')}
        ${hasStock ? `<td class="r">${stock}</td>` : ''}</tr>`;
    }).join('') || `<tr><td colspan="${cols.length + 3}" class="empty-line">No items match your search or filters.</td></tr>`}</tbody></table>`;
  renderBulkBar(mod);
}
function partsSummary(r, mod) {
  return (mod.stock.parts || []).filter(p => Number(r.parts?.[p.key] || 0) > 0).map(p => `<span>${esc(p.label)} ${fmtNum(r.parts[p.key])}</span>`).join('');
}
function flagFor(r, mod) {
  const f = visibleFields(mod).find(x => x.key === 'flag' && x.type === 'select');
  const v = f && r.data?.flag;
  const t = v && Object.values(TAPES).find(x => x.name.toLowerCase() === String(v).toLowerCase());
  return t ? `<span class="flag" style="--tb:${t.bg}" title="${esc(v)} flag"></span>` : '';
}
ACT.sortBy = el => {
  const ui = modUi(el.dataset.mod);
  if (ui.sortKey === el.dataset.key) ui.dir *= -1; else { ui.sortKey = el.dataset.key; ui.dir = 1; }
  renderModuleTable(modById(el.dataset.mod));
};
ACT.selOne = (el, e) => {
  e.stopPropagation();
  const sel = App.sel[el.dataset.mod];
  el.checked ? sel.add(el.dataset.id) : sel.delete(el.dataset.id);
  el.closest('tr').classList.toggle('selected', el.checked);
  renderBulkBar(modById(el.dataset.mod));
};
ACT.selAll = el => {
  const mod = modById(el.dataset.mod), sel = App.sel[mod.id];
  filteredRecords(mod).forEach(r => el.checked ? sel.add(r.id) : sel.delete(r.id));
  renderModuleTable(mod);
};
function renderBulkBar(mod) {
  const bar = $('#bulkBar'); if (!bar) return;
  const n = App.sel[mod.id]?.size || 0;
  bar.hidden = !n;
  bar.innerHTML = n ? `<span><b>${fmtNum(n)}</b> selected</span>
    <button class="btn sm" data-act="exportModule" data-mod="${mod.id}" data-only="sel">Export CSV</button>
    ${canEdit() ? `<button class="btn sm" data-act="bulkEdit" data-mod="${mod.id}">Change a field</button>` : ''}
    <button class="btn ghost sm" data-act="selClear" data-mod="${mod.id}">Clear selection</button>` : '';
}
ACT.selClear = el => { App.sel[el.dataset.mod].clear(); renderModuleTable(modById(el.dataset.mod)); };

function recordCsvRow(r, mod) {
  const row = {};
  mod.fields.filter(f => !f.hidden).forEach(f => { row[f.label] = fieldPlain(f, r.data?.[f.key]); });
  if (mod.stock?.mode === 'single') { row['Stock'] = r.stock ?? 0; row['Unit'] = recUnit(r, mod); row['Low-stock alert at'] = r.lowAt ?? mod.stock.lowAt; }
  if (mod.stock?.mode === 'parts') (mod.stock.parts || []).forEach(p => { row[p.label] = r.parts?.[p.key] || 0; });
  return row;
}
ACT.exportModule = el => {
  const mod = modById(el.dataset.mod);
  const recs = el.dataset.only === 'sel' ? recordsOf(mod.id).filter(r => App.sel[mod.id]?.has(r.id)) : filteredRecords(mod);
  downloadCsv(`${fileStem(mod.name)}_${todayIso()}.csv`, recs.map(r => recordCsvRow(r, mod)));
  toast(`Exported ${plural(recs.length, 'item')}.`);
};

ACT.bulkEdit = el => {
  const mod = modById(el.dataset.mod);
  const ids = [...App.sel[mod.id]];
  const editable = visibleFields(mod).filter(f => ['text', 'select', 'date', 'number', 'url', 'textarea'].includes(f.type) && f.key !== 'name');
  if (!editable.length) { toast('This module has no fields that can be changed in bulk.', 'warn'); return; }
  const m = openModal({
    title: `Change a field for ${plural(ids.length, 'item')}`,
    body: `<div class="stack"><p class="muted">Use this, for example, to move many items to a new storage location at once.</p>
      <label class="field"><span>Field</span><select id="bkField">${editable.map(f => `<option value="${esc(f.key)}">${esc(f.label)}</option>`).join('')}</select></label>
      <div id="bkValue"></div></div>`,
    actions: [{ label: 'Cancel', kind: 'ghost' }, {
      label: 'Apply to selected', kind: 'primary', onClick: async close => {
        const f = editable.find(x => x.key === $('#bkField').value);
        const value = readField(f, 'bk');
        const ts = Date.now();
        await App.store.batch(ids.map(id => {
          const r = recById(id);
          const log = [{ ts, user: me(), action: 'edit', note: `${f.label} → ${fieldPlain(f, value) || '(empty)'}` }, ...(r.log || [])].slice(0, 30);
          return ['merge', 'records', id, { data: { ...r.data, [f.key]: value }, log, updatedAt: ts, updatedBy: me() }];
        }));
        await logChange(`Changed “${f.label}” for ${plural(ids.length, 'item')} in ${mod.name}`);
        toast(`Updated ${plural(ids.length, 'item')}.`);
        close();
      }
    }]
  });
  const drawValue = () => { const f = editable.find(x => x.key === $('#bkField', m.el).value); $('#bkValue', m.el).innerHTML = fieldInput({ ...f, required: false, help: '' }, '', 'bk'); };
  $('#bkField', m.el).addEventListener('change', drawValue);
  drawValue();
};

/* ── Record side panel ──────────────────────────────────────────────────── */
ACT.openRecord = (el, e) => {
  if (e?.target?.closest('td.sel')) return;
  App.drawer = { kind: 'record', id: el.dataset.id, mode: 'view' };
  DRAWERS.record(App.drawer);
};
ACT.newRecord = el => {
  App.drawer = { kind: 'record', id: null, mode: 'edit', moduleId: el.dataset.mod };
  DRAWERS.record(App.drawer);
};

function reservationsFor(recordId) {
  return App.experiments.map(e => ({ e, items: reservedItemsForExperiment(e).filter(i => i.recordId === recordId) }))
    .filter(x => x.items.length);
}

DRAWERS.record = d => {
  if (d.mode === 'edit') return renderRecordForm(d);
  const r = recById(d.id);
  if (!r) {
    if (d.waitFor && Date.now() - d.waitFor < 8000) { openDrawer('<div class="drawer-body"><p class="muted">Loading…</p></div>'); return; }
    closeDrawer(); return;
  }
  const mod = modById(r.moduleId);
  const mode = mod?.stock?.mode || 'none';
  const st = stockState(r, mod);
  const res = reservationsFor(r.id);
  const refs = App.experiments.filter(e => (e.refs || []).some(x => x.recordId === r.id));
  let stockHtml = '';
  if (mode === 'single') {
    stockHtml = `<section class="stock-box ${st}">
      <div><div class="stock-qty"><span class="num">${fmtNum(r.stock ?? 0)}</span> <span>${esc(recUnit(r, mod))}</span></div>
        <div class="muted small">Low-stock alert at ${fmtNum(r.lowAt ?? mod.stock.lowAt ?? 0)} ${esc(recUnit(r, mod))}</div></div>
      <div class="stock-side">${stockBadge(st)}${canEdit() ? `<button class="btn sm" data-act="stockChange" data-id="${r.id}">Update stock</button>` : ''}</div></section>`;
  } else if (mode === 'parts') {
    stockHtml = `<section class="parts-box"><div class="parts-head"><h3>Samples</h3><span class="muted small">${fmtNum(partsTotal(r))} ${esc(recUnit(r, mod))} in total</span></div>
      <div class="parts-grid">${(mod.stock.parts || []).map(p => {
        const n = Number(r.parts?.[p.key] || 0);
        return `<div class="part${n ? '' : ' zero'}"><span class="pl">${esc(p.label)}</span><span class="num">${fmtNum(n)}</span>
          ${canEdit() ? `<span class="pbtns"><button class="icon-btn sm" data-act="partStep" data-id="${r.id}" data-part="${esc(p.key)}" data-d="-1" aria-label="Remove one ${esc(p.label)}"${n <= 0 ? ' disabled' : ''}>−</button>
          <button class="icon-btn sm" data-act="partStep" data-id="${r.id}" data-part="${esc(p.key)}" data-d="1" aria-label="Add one ${esc(p.label)}">+</button></span>` : ''}</div>`;
      }).join('')}</div></section>`;
  }
  const rows = visibleFields(mod).filter(f => f.key !== 'name').map(f => {
    const html = fieldDisplay(f, r.data?.[f.key]);
    if (!html) return '';
    const wide = ['richtext', 'table', 'file', 'textarea', 'sequence'].includes(f.type);
    return `<div class="dl-row${wide ? ' wide' : ''}"><dt>${esc(f.label)}</dt><dd>${html}</dd></div>`;
  }).join('');
  openDrawer(`
    <header class="drawer-head">
      <div>${tapeLabel(mod, true)}<h2>${flagFor(r, mod)}${esc(recName(r))}</h2>
        <p class="muted small">Added by ${esc(r.createdBy || '?')} on ${esc(fmtDate(new Date(r.createdAt || Date.now()).toISOString().slice(0, 10)))}${r.updatedAt ? ` · updated ${esc(fmtTs(r.updatedAt))}` : ''}</p></div>
      <button class="icon-btn" data-act="closeDrawer" aria-label="Close">${ICON.x}</button>
    </header>
    <div class="drawer-body">
      ${stockHtml}
      ${rows ? `<dl class="dl">${rows}</dl>` : '<p class="muted">No details filled in yet.</p>'}
      ${res.length ? `<section class="sub-sec"><h3>Reserved by experiments</h3>${res.map(x => `<a class="list-row" href="#/experiments/${x.e.id}">
          <span class="grow">${esc(x.e.title)}</span><span class="num">${x.items.map(i => `${fmtNum(i.amount)} ${esc(i.unit || '')}${i.part ? ' ' + esc(partLabel(mod, i.part)) : ''}`).join(', ')}</span>${expStatusBadge(x.e)}</a>`).join('')}</section>` : ''}
      ${refs.length ? `<section class="sub-sec"><h3>Used as reference in</h3>${refs.map(e => `<a class="list-row" href="#/experiments/${e.id}"><span class="grow">${esc(e.title)}</span>${expStatusBadge(e)}</a>`).join('')}</section>` : ''}
      ${(r.log || []).length ? `<section class="sub-sec"><h3>History</h3>${r.log.slice(0, 10).map(l => `<div class="log-row"><span class="grow">${esc(logText(l, r, mod))}</span><span class="muted small">${esc(l.user || '')} · ${esc(fmtTs(l.ts))}</span></div>`).join('')}</section>` : ''}
    </div>
    ${canEdit() ? `<footer class="drawer-foot">
      <button class="btn danger ghost" data-act="deleteRecord" data-id="${r.id}">Delete</button><span class="grow"></span>
      <button class="btn" data-act="duplicateRecord" data-id="${r.id}">Duplicate</button>
      <button class="btn primary" data-act="editRecord" data-id="${r.id}">Edit</button></footer>` : ''}`);
};
const partLabel = (mod, key) => (mod?.stock?.parts || []).find(p => p.key === key)?.label || key;
function logText(l, r, mod) {
  const u = recUnit(r, mod);
  const part = l.part ? ` ${partLabel(mod, l.part)}` : '';
  if (l.action === 'use') return `Used ${fmtNum(l.amount)} ${u}${part}${l.note ? ' — ' + l.note : ''}`;
  if (l.action === 'add') return `Added ${fmtNum(l.amount)} ${u}${part}${l.note ? ' — ' + l.note : ''}`;
  if (l.action === 'set') return `Stock set to ${fmtNum(l.amount)} ${u}${l.note ? ' — ' + l.note : ''}`;
  if (l.action === 'reserve') return `Reserved ${fmtNum(l.amount)} ${u}${part} for ${l.note}`;
  if (l.action === 'release') return `Returned ${fmtNum(l.amount)} ${u}${part} from ${l.note}`;
  return l.note || l.action || '';
}
ACT.editRecord = el => { App.drawer = { kind: 'record', id: el.dataset.id, mode: 'edit' }; DRAWERS.record(App.drawer); };
ACT.duplicateRecord = el => {
  const r = recById(el.dataset.id), mod = modById(r.moduleId);
  const data = { ...r.data, name: recName(r) + ' (copy)' };
  visibleFields(mod).filter(f => f.type === 'file').forEach(f => { data[f.key] = []; });
  App.drawer = { kind: 'record', id: null, mode: 'edit', moduleId: r.moduleId, copy: { data, stock: r.stock, unit: r.unit, lowAt: r.lowAt, parts: r.parts } };
  DRAWERS.record(App.drawer);
};

function renderRecordForm(d) {
  const existing = d.id ? recById(d.id) : null;
  const src = existing || d.copy || {};
  const mod = modById(existing?.moduleId || d.moduleId);
  const mode = mod.stock?.mode || 'none';
  const data = src.data || {};
  App.drawerDirty = false;
  d.originalStock = existing ? Number(existing.stock ?? 0) : null;
  d.originalParts = existing ? { ...(existing.parts || {}) } : null;
  let stockForm = '';
  if (mode === 'single') stockForm = `<fieldset class="form-sec"><legend>Stock</legend><div class="form-grid">
      <label class="field"><span>Quantity</span><input id="rf-__stock" inputmode="decimal" value="${esc(src.stock ?? '')}" placeholder="0"></label>
      <label class="field"><span>Unit</span><input id="rf-__unit" value="${esc(src.unit || mod.stock.unit || '')}"></label>
      <label class="field"><span>Low-stock alert at</span><input id="rf-__low" inputmode="decimal" value="${esc(src.lowAt ?? mod.stock.lowAt ?? '')}"></label></div></fieldset>`;
  if (mode === 'parts') stockForm = `<fieldset class="form-sec"><legend>Samples (${esc(mod.stock.unit || 'pcs')})</legend><div class="parts-inputs">
      ${(mod.stock.parts || []).map(p => `<label class="field"><span>${esc(p.label)}</span><input id="rf-__part-${esc(p.key)}" inputmode="numeric" value="${esc(src.parts?.[p.key] || '')}" placeholder="0"></label>`).join('')}</div></fieldset>`;
  openDrawer(`
    <header class="drawer-head">
      <div>${tapeLabel(mod, true)}<h2>${existing ? 'Edit ' + esc(recName(existing)) : `New ${esc((mod.singular || 'item').toLowerCase())}`}</h2></div>
      <button class="icon-btn" data-act="closeDrawer" aria-label="Close">${ICON.x}</button>
    </header>
    <form class="drawer-body" id="recForm" novalidate>
      ${stockForm}
      <fieldset class="form-sec"><legend>Details</legend><div class="form-grid">${visibleFields(mod).map(f => fieldInput(f, data[f.key], 'rf', mod)).join('')}</div></fieldset>
    </form>
    <footer class="drawer-foot"><span class="grow"></span><button class="btn ghost" data-act="cancelRecordEdit">Cancel</button>
      <button class="btn primary" data-act="saveRecord">${existing ? 'Save changes' : 'Add ' + esc((mod.singular || 'item').toLowerCase())}</button></footer>`);
  visibleFields(mod).filter(f => f.type === 'file').forEach(f => renderFileList(`rf-${f.key}`));
  const form = $('#recForm');
  form.addEventListener('input', () => { App.drawerDirty = true; });
  form.addEventListener('submit', e => { e.preventDefault(); ACT.saveRecord($('[data-act="saveRecord"]')); });
  setTimeout(() => $('#rf-name')?.focus(), 60);
}
function markDirty() { if (App.drawer?.mode === 'edit') App.drawerDirty = true; else if (VIEWS[App.route.name]?.form) App.dirty = true; }
ACT.cancelRecordEdit = () => {
  const d = App.drawer;
  if (App.drawerDirty && !confirm('Discard your unsaved changes?')) return;
  App.drawerDirty = false;
  if (d?.id) { App.drawer = { kind: 'record', id: d.id, mode: 'view' }; DRAWERS.record(App.drawer); } else closeDrawer();
};

ACT.saveRecord = async btn => {
  const d = App.drawer;
  const existing = d.id ? recById(d.id) : null;
  const mod = modById(existing?.moduleId || d.moduleId);
  const mode = mod.stock?.mode || 'none';
  const data = { ...(existing?.data || {}) };
  try {
    for (const f of visibleFields(mod)) {
      if (f.type === 'file') continue;
      const v = readField(f, 'rf');
      if (f.required && isEmptyValue(v)) throw new Error(`Fill in “${f.label}”.`);
      data[f.key] = v;
    }
    let stock, lowAt, unit, parts;
    if (mode === 'single') {
      const raw = $('#rf-__stock').value.trim();
      stock = raw ? parseNum(raw) : 0;
      if (!Number.isFinite(stock) || stock < 0) throw new Error('Quantity must be a number of 0 or more.');
      const lowRaw = $('#rf-__low').value.trim();
      lowAt = lowRaw ? parseNum(lowRaw) : Number(mod.stock.lowAt || 0);
      if (!Number.isFinite(lowAt)) throw new Error('“Low-stock alert at” must be a number.');
      unit = $('#rf-__unit').value.trim() || mod.stock.unit || '';
    }
    if (mode === 'parts') {
      parts = {};
      for (const p of mod.stock.parts || []) {
        const raw = $(`#rf-__part-${CSS.escape(p.key)}`).value.trim();
        const n = raw ? parseNum(raw) : 0;
        if (!Number.isFinite(n) || n < 0) throw new Error(`“${p.label}” must be a number of 0 or more.`);
        if (n > 0) parts[p.key] = n;
      }
    }
    btn.disabled = true; btn.textContent = 'Saving…';
    const id = existing?.id || newId();
    for (const f of visibleFields(mod).filter(x => x.type === 'file')) data[f.key] = await finalizeFiles(`rf-${f.key}`, `records/${id}`);
    const now = Date.now();
    if (!existing) {
      const rec = { id, moduleId: mod.id, data, createdAt: now, createdBy: me(), updatedAt: now, updatedBy: me(), log: [] };
      if (mode === 'single') Object.assign(rec, { stock, unit, lowAt });
      if (mode === 'parts') Object.assign(rec, { parts, unit: mod.stock.unit || 'pcs' });
      await App.store.put('records', id, rec);
      await logChange(`Added ${mod.singular?.toLowerCase() || 'item'} “${recName(rec)}” to ${mod.name}`);
    } else {
      // Use a transaction so a stock change made by someone else meanwhile is not overwritten.
      await App.store.transact(async tx => {
        const cur = await tx.get('records', id);
        if (!cur) throw new Error('This item was deleted by someone else.');
        const next = { ...cur, data, updatedAt: now, updatedBy: me() };
        const log = [...(cur.log || [])];
        if (mode === 'single') {
          next.unit = unit; next.lowAt = lowAt;
          if (stock !== d.originalStock) { next.stock = stock; log.unshift({ ts: now, user: me(), action: 'set', amount: stock, note: 'corrected in edit form' }); }
        }
        if (mode === 'parts') {
          const changed = (mod.stock.parts || []).some(p => Number(parts[p.key] || 0) !== Number(d.originalParts?.[p.key] || 0));
          if (changed) { next.parts = parts; log.unshift({ ts: now, user: me(), action: 'edit', note: 'sample counts corrected in edit form' }); }
        }
        next.log = log.slice(0, 30);
        tx.set('records', id, next);
      });
      for (const f of visibleFields(mod).filter(x => x.type === 'file')) await cleanupRemovedFiles(`rf-${f.key}`);
      await logChange(`Updated “${data.name}” in ${mod.name}`);
    }
    App.drawerDirty = false;
    toast(existing ? 'Changes saved.' : `${mod.singular || 'Item'} added.`);
    App.drawer = { kind: 'record', id, mode: 'view', waitFor: Date.now() };
    DRAWERS.record(App.drawer);
  } catch (err) {
    console.error(err); toast(errorMessage(err), 'bad');
    btn.disabled = false; btn.textContent = existing ? 'Save changes' : 'Add ' + (mod.singular || 'item').toLowerCase();
  }
};

ACT.deleteRecord = async el => {
  const r = recById(el.dataset.id), mod = modById(r.moduleId);
  const res = reservationsFor(r.id);
  if (res.length) {
    openModal({ title: 'This item is still reserved', body: `<p class="lead">${esc(recName(r))} is reserved by ${plural(res.length, 'experiment')}. Edit or delete ${res.length === 1 ? 'that experiment' : 'those experiments'} first, so the stock stays correct.</p>
      <div class="list">${res.map(x => `<a class="list-row" href="#/experiments/${x.e.id}">${esc(x.e.title)}</a>`).join('')}</div>`, actions: [{ label: 'OK', kind: 'primary' }] });
    return;
  }
  if (!await confirmDialog(`Delete ${recName(r)}?`, `This removes it from ${esc(mod.name)} permanently. Experiments that only list it as a reference keep their copy of the name.`)) return;
  try {
    const ops = [['del', 'records', r.id]];
    App.projects.filter(p => (p.links || []).includes(r.id)).forEach(p => ops.push(['merge', 'projects', p.id, { links: p.links.filter(x => x !== r.id) }]));
    await App.store.batch(ops);
    for (const f of visibleFields(mod).filter(x => x.type === 'file')) for (const fl of r.data?.[f.key] || []) if (fl.path) await App.store.removeFile(fl.path);
    App.drawerDirty = false; closeDrawer();
    await logChange(`Deleted “${recName(r)}” from ${mod.name}`);
    toast('Deleted.');
  } catch (err) { toast(errorMessage(err), 'bad'); }
};

/* Stock change for single-quantity items */
ACT.stockChange = el => {
  const r = recById(el.dataset.id), mod = modById(r.moduleId), unit = recUnit(r, mod);
  openModal({
    title: `Update stock: ${recName(r)}`,
    body: `<div class="stack"><p class="muted">Now: <b class="num">${fmtNum(r.stock ?? 0)} ${esc(unit)}</b></p>
      <div class="seg" role="radiogroup">
        <label><input type="radio" name="scA" value="use" checked><span>Use some</span></label>
        <label><input type="radio" name="scA" value="add"><span>Add (restock)</span></label>
        <label><input type="radio" name="scA" value="set"><span>Set exact amount</span></label></div>
      <label class="field"><span id="scLabel">Amount used (${esc(unit)})</span><input id="scAmount" inputmode="decimal" autocomplete="off"></label>
      <label class="field"><span>Note (optional)</span><input id="scNote" placeholder="e.g. staining panel 3"></label></div>`,
    actions: [{ label: 'Cancel', kind: 'ghost' }, {
      label: 'Save', kind: 'primary', onClick: async close => {
        const action = $('input[name=scA]:checked').value;
        const amount = parseNum($('#scAmount').value);
        if (!Number.isFinite(amount) || amount < 0 || (action !== 'set' && amount === 0)) { toast('Enter an amount greater than 0.', 'warn'); return true; }
        const note = $('#scNote').value.trim();
        let after = 0;
        await App.store.transact(async tx => {
          const cur = await tx.get('records', r.id);
          if (!cur) throw new Error('This item no longer exists.');
          const before = Number(cur.stock || 0);
          if (action === 'use' && amount > before + 1e-9) throw new Error(`Only ${fmtNum(before)} ${unit} left.`);
          after = round4(action === 'use' ? before - amount : action === 'add' ? before + amount : amount);
          tx.set('records', r.id, { ...cur, stock: after, updatedAt: Date.now(), updatedBy: me(), log: [{ ts: Date.now(), user: me(), action, amount, note }, ...(cur.log || [])].slice(0, 30) });
        });
        await logChange(`${action === 'use' ? 'Used' : action === 'add' ? 'Restocked' : 'Set stock of'} “${recName(r)}”: now ${fmtNum(after)} ${unit}`);
        close(); toast('Stock updated.');
        if (action === 'use' && after <= Number(r.lowAt ?? mod.stock.lowAt ?? 0)) sendLowStockAlert({ ...r, stock: after }, mod, App.user.email);
      }
    }]
  });
  $$('input[name=scA]').forEach(i => i.addEventListener('change', () => {
    $('#scLabel').textContent = `${{ use: 'Amount used', add: 'Amount added', set: 'New amount' }[i.value]} (${unit})`;
  }));
};

ACT.partStep = async el => {
  const r = recById(el.dataset.id), mod = modById(r.moduleId), part = el.dataset.part, delta = Number(el.dataset.d);
  try {
    await App.store.transact(async tx => {
      const cur = await tx.get('records', r.id);
      const before = Number(cur.parts?.[part] || 0);
      if (before + delta < 0) throw new Error('There are no samples left to remove.');
      tx.set('records', r.id, { ...cur, parts: { ...(cur.parts || {}), [part]: before + delta }, updatedAt: Date.now(), updatedBy: me(),
        log: [{ ts: Date.now(), user: me(), action: delta > 0 ? 'add' : 'use', amount: Math.abs(delta), part }, ...(cur.log || [])].slice(0, 30) });
    });
    await logChange(`${delta > 0 ? 'Added' : 'Used'} 1 ${partLabel(mod, part)} sample of “${recName(r)}”`);
  } catch (err) { toast(errorMessage(err), 'bad'); }
};
