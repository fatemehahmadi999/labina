/* ──────────────────────────────────────────────────────────────────────────
   schema.js — field types, tape colours and starter module templates.
   A "module" is a description of one kind of inventory item. The app draws
   forms, tables, stock handling and the experiment picker from it.
   ────────────────────────────────────────────────────────────────────────── */

const FIELD_TYPES = {
  text:        { label: 'Short text' },
  textarea:    { label: 'Long text' },
  number:      { label: 'Number' },
  date:        { label: 'Date' },
  select:      { label: 'Dropdown (one choice)', options: true },
  multiselect: { label: 'Checklist (several choices)', options: true },
  checkbox:    { label: 'Yes / no' },
  url:         { label: 'Web link' },
  sequence:    { label: 'DNA / protein sequence' },
  richtext:    { label: 'Formatted text (document)' },
  table:       { label: 'Table', columns: true },
  file:        { label: 'File attachments' }
};

/* Colours of lab tape. fg is the text colour that stays readable on the tape. */
const TAPES = {
  yellow: { bg: '#F2C94C', fg: '#3D2E00', name: 'Yellow' },
  orange: { bg: '#F2994A', fg: '#3F1D00', name: 'Orange' },
  red:    { bg: '#E0574F', fg: '#FFFFFF', name: 'Red' },
  pink:   { bg: '#EC7AB0', fg: '#3D0A22', name: 'Pink' },
  violet: { bg: '#9B6BE0', fg: '#FFFFFF', name: 'Violet' },
  blue:   { bg: '#4C8BE0', fg: '#FFFFFF', name: 'Blue' },
  teal:   { bg: '#2BB3A6', fg: '#00302B', name: 'Teal' },
  green:  { bg: '#6BBF59', fg: '#0F2E08', name: 'Green' },
  lime:   { bg: '#C5DB4A', fg: '#2B3300', name: 'Lime' },
  grey:   { bg: '#9AA6B1', fg: '#16202A', name: 'Grey' }
};

const GHS_HAZARDS = ['Flammable', 'Oxidising', 'Explosive', 'Compressed gas', 'Corrosive', 'Toxic',
  'Irritant / harmful', 'Health hazard', 'Environmental hazard', 'Radioactive', 'Biohazard'];
const FLAG_OPTIONS = ['Yellow', 'Orange', 'Red'];

/* Small helper to describe a field in a template. */
function F(key, label, type = 'text', extra = {}) {
  return { key, label, type, inList: false, required: false, options: [], columns: [], ...extra };
}

/* Starter modules. `tid` lets the import tool find the right module again later. */
const TEMPLATES = [
  {
    tid: 'antibodies', name: 'Antibodies', singular: 'Antibody', color: 'violet',
    description: 'Primary and conjugated antibodies for FACS, imaging and staining panels.',
    stock: { mode: 'single', unit: 'µL', lowAt: 20, parts: [] }, link: 'consume',
    fields: [
      F('name', 'Target / name', 'text', { required: true, inList: true }),
      F('purpose', 'Purpose', 'select', { inList: true, options: [], help: 'Pick a purpose, or add a new one.' }),
      F('conjugate', 'Fluorophore / conjugate', 'text', { inList: true }),
      F('clone', 'Clone', 'text', { inList: true }),
      F('reactivity', 'Reactivity'), F('host', 'Host'),
      F('clonality', 'Clonality', 'select', { options: ['Monoclonal', 'Polyclonal', 'Recombinant'] }),
      F('company', 'Company', 'text', { inList: true }), F('catalog', 'Catalog number'), F('lot', 'Lot number'),
      F('dilution', 'Working dilution'), F('retrieval', 'Antigen retrieval'), F('status', 'Validation status'),
      F('panel', 'Source list / panel'), F('synonym', 'Synonym / alias'),
      F('location', 'Storage location', 'text', { inList: true }),
      F('delivered', 'Delivery date', 'date'), F('expiry', 'Expiry date', 'date', { expiry: true }),
      F('link', 'Product page', 'url'), F('flag', 'Colour flag', 'select', { options: FLAG_OPTIONS }),
      F('notes', 'Notes', 'textarea'), F('files', 'Attachments', 'file')
    ]
  },
  {
    tid: 'reagents', name: 'Reagents & media', singular: 'Reagent', color: 'blue',
    description: 'Chemicals, buffers, media and general consumables.',
    stock: { mode: 'single', unit: 'units', lowAt: 1, parts: [] }, link: 'consume',
    fields: [
      F('name', 'Name', 'text', { required: true, inList: true }),
      F('type', 'Type', 'select', { inList: true, options: ['Reagent', 'Medium', 'Buffer', 'Chemical', 'Consumable', 'Other'] }),
      F('company', 'Company / supplier', 'text', { inList: true }), F('catalog', 'Catalog number'),
      F('size', 'Pack size'), F('location', 'Storage location', 'text', { inList: true }),
      F('delivered', 'Delivery date', 'date'), F('opened', 'Date opened', 'date'),
      F('expiry', 'Expiry date', 'date', { expiry: true }),
      F('hazards', 'Hazards (GHS)', 'multiselect', { options: GHS_HAZARDS }),
      F('link', 'Datasheet / SDS', 'url'), F('flag', 'Colour flag', 'select', { options: FLAG_OPTIONS }),
      F('notes', 'Notes', 'textarea'), F('files', 'Attachments', 'file')
    ]
  },
  {
    tid: 'kits', name: 'Kits', singular: 'Kit', color: 'teal',
    description: 'Commercial kits, tracked per kit or per reaction.',
    stock: { mode: 'single', unit: 'kits', lowAt: 1, parts: [] }, link: 'consume',
    fields: [
      F('name', 'Name', 'text', { required: true, inList: true }),
      F('company', 'Company', 'text', { inList: true }), F('catalog', 'Catalog number', 'text', { inList: true }),
      F('lot', 'Lot number'), F('location', 'Storage location', 'text', { inList: true }),
      F('delivered', 'Delivery date', 'date'), F('expiry', 'Expiry date', 'date', { expiry: true }),
      F('link', 'Product page', 'url'), F('flag', 'Colour flag', 'select', { options: FLAG_OPTIONS }),
      F('notes', 'Notes', 'textarea'), F('files', 'Attachments', 'file')
    ]
  },
  {
    tid: 'primers', name: 'Primers', singular: 'Primer', color: 'lime',
    description: 'Oligos for PCR, qPCR, sequencing and cloning.',
    stock: { mode: 'single', unit: 'µL', lowAt: 50, parts: [] }, link: 'consume',
    fields: [
      F('name', 'Name', 'text', { required: true, inList: true }),
      F('sequence', "Sequence 5'→3'", 'sequence', { inList: true }),
      F('orientation', 'Orientation', 'select', { options: ['Forward', 'Reverse', 'Probe'] }),
      F('application', 'Application', 'select', { inList: true, options: ['PCR', 'qPCR', 'Sequencing', 'Cloning', 'Other'] }),
      F('stockConc', 'Stock concentration (µM)', 'number'), F('workConc', 'Working concentration (µM)', 'number'),
      F('tm', 'Tm (°C)', 'number'), F('location', 'Storage location', 'text', { inList: true }),
      F('notes', 'Notes', 'textarea')
    ]
  },
  {
    tid: 'plasmids', name: 'Plasmids', singular: 'Plasmid', color: 'pink',
    description: 'Plasmid stocks with backbone, insert and selection details.',
    stock: { mode: 'single', unit: 'µL', lowAt: 5, parts: [] }, link: 'consume',
    fields: [
      F('name', 'Name', 'text', { required: true, inList: true }),
      F('plasmidId', 'Plasmid ID', 'text', { inList: true }), F('backbone', 'Backbone'),
      F('vectorType', 'Vector type', 'select', { options: ['Expression', 'Lentiviral', 'AAV', 'Retroviral', 'CRISPR', 'Reporter', 'Cloning', 'Other'] }),
      F('insert', 'Insert', 'text', { inList: true }), F('insertSize', 'Insert size (bp)', 'number'),
      F('promoter', 'Promoter'), F('resistance', 'Bacterial resistance'), F('selection', 'Selection marker'),
      F('concentration', 'Concentration'), F('addgeneId', 'Addgene ID'), F('receivedFrom', 'Received from'),
      F('addgeneLink', 'Addgene link', 'url'), F('benchlingLink', 'Benchling link', 'url'),
      F('hostCells', 'Host cell lines'), F('location', 'Storage location', 'text', { inList: true }),
      F('notes', 'Notes', 'textarea'), F('files', 'Attachments', 'file')
    ]
  },
  {
    tid: 'celllines', name: 'Cell lines', singular: 'Cell line', color: 'green',
    description: 'Frozen cell line stocks, counted in vials.',
    stock: { mode: 'single', unit: 'vials', lowAt: 2, parts: [] }, link: 'consume',
    fields: [
      F('name', 'Cell line', 'text', { required: true, inList: true }),
      F('passage', 'Passage', 'number', { inList: true }), F('frozen', 'Date frozen', 'date'),
      F('location', 'Freezer location', 'text', { inList: true }), F('origin', 'Origin / source', 'text', { inList: true }),
      F('mycoplasma', 'Mycoplasma status', 'select', { options: ['Negative', 'Positive', 'Not tested'] }),
      F('notes', 'Notes (genotype, treatment…)', 'textarea'), F('files', 'Attachments', 'file')
    ]
  },
  {
    tid: 'mice', name: 'Mice / PDX', singular: 'Mouse', color: 'orange',
    description: 'Mice and PDX models, with tissue samples counted per organ.',
    stock: {
      mode: 'parts', unit: 'pcs', lowAt: 0,
      parts: [['pt', 'PT'], ['lung', 'Lung'], ['kidney', 'Kidney'], ['ovary', 'Ovary'], ['pb', 'PB'], ['bm', 'BM'],
        ['brain', 'Brain'], ['liver', 'Liver'], ['ft', 'FT'], ['ag', 'AG']].map(([key, label]) => ({ key, label }))
    },
    link: 'consume',
    fields: [
      F('name', 'Mouse ID', 'text', { required: true, inList: true }),
      F('model', 'PDX model', 'text', { inList: true }), F('year', 'Year', 'number', { inList: true }),
      F('location', 'Location', 'text', { inList: true }),
      F('notes', 'Notes (passage, treatment…)', 'textarea'), F('files', 'Attachments', 'file')
    ]
  },
  {
    tid: 'protocols', name: 'Protocols', singular: 'Protocol', color: 'grey',
    description: 'Lab protocols. Experiments link to them, but they have no stock.',
    stock: { mode: 'none', unit: '', lowAt: 0, parts: [] }, link: 'reference',
    fields: [
      F('name', 'Protocol name', 'text', { required: true, inList: true }),
      F('version', 'Version', 'text', { inList: true }),
      F('summary', 'Summary', 'textarea', { inList: true }),
      F('materials', 'Materials & reagents', 'table', { columns: ['Material / reagent', 'Amount', 'Unit', 'Preparation / notes'] }),
      F('procedure', 'Procedure', 'richtext'),
      F('files', 'Attachments', 'file')
    ]
  }
];

/* Turn a template into a fresh module record. */
function moduleFromTemplate(t, order = 0) {
  const now = Date.now();
  return {
    id: newId(), tid: t.tid, name: t.name, singular: t.singular, color: t.color, description: t.description || '',
    stock: JSON.parse(JSON.stringify(t.stock)), link: t.link,
    fields: t.fields.map(f => ({ ...JSON.parse(JSON.stringify(f)), id: newId() })),
    order, archived: false, version: 1, createdAt: now, updatedAt: now
  };
}

/* Make a safe, unique key from a label (used once, when a field is created). */
function keyFromLabel(label, existing) {
  let base = String(label || 'field').toLowerCase()
    .replace(/[^a-z0-9]+(.)?/g, (_, c) => (c ? c.toUpperCase() : '')).replace(/^[0-9]+/, '') || 'field';
  let key = base, n = 2;
  const taken = new Set(existing);
  while (taken.has(key) || ['id', 'stock', 'unit', 'lowAt', 'parts', 'log', 'moduleId'].includes(key)) key = base + n++;
  return key;
}

function newId() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}
