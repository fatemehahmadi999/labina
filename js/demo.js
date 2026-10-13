/* ──────────────────────────────────────────────────────────────────────────
   demo.js — sample data for DEMO MODE only (config.js has firebase: null).
   It fills an empty demo lab with realistic example items, a project and
   experiments, so visitors can see how the app feels. Never used with Firebase.
   ────────────────────────────────────────────────────────────────────────── */

async function seedDemoLab(user) {
  const now = Date.now();
  const day = 86400000;
  const iso = offsetDays => { const d = new Date(now + offsetDays * day); return d.toISOString().slice(0, 10); };
  const who = user.name;

  const mods = TEMPLATES.map((t, i) => moduleFromTemplate(t, i));
  const mod = tid => mods.find(m => m.tid === tid);
  const records = [];
  const rec = (tid, data, stock = {}) => {
    const r = { id: newId(), moduleId: mod(tid).id, data, createdAt: now - 20 * day, createdBy: who, updatedAt: now - 2 * day, updatedBy: who, log: [], ...stock };
    records.push(r);
    return r;
  };
  const one = (amount, unit, lowAt) => ({ stock: amount, unit, lowAt });

  // Antibodies (purposes are user-added, as in a real lab)
  const cd45 = rec('antibodies', { name: 'CD45', purpose: 'FACS', conjugate: 'APC', clone: 'HI30', reactivity: 'Human', host: 'Mouse', clonality: 'Monoclonal',
    company: 'BioLegend', catalog: '304012', dilution: '1:100', location: 'Fridge 2, box A', expiry: iso(300), files: [] }, one(80, 'µL', 20));
  const cd68 = rec('antibodies', { name: 'CD68', purpose: 'IF panel', conjugate: '', clone: 'KP1', reactivity: 'Human', host: 'Mouse', clonality: 'Monoclonal',
    company: 'Abcam', catalog: 'ab955', dilution: '1:200', retrieval: 'pH 6 (citrate)', status: 'Validated on FFPE', location: 'Fridge 2, box B', expiry: iso(21), flag: 'Yellow', files: [] }, one(15, 'µL', 20));
  rec('antibodies', { name: 'CD3', purpose: 'FACS', conjugate: 'PE', clone: 'UCHT1', reactivity: 'Human', company: 'BioLegend', catalog: '300408', location: 'Fridge 2, box A', files: [] }, one(0, 'µL', 20));
  const epcam = rec('antibodies', { name: 'EpCAM', purpose: 'MACSima', conjugate: 'FITC', clone: 'REA764', company: 'Miltenyi', catalog: '130-111-116', location: 'Fridge 1', files: [] }, one(120, 'µL', 20));
  rec('antibodies', { name: 'Ki-67', purpose: 'IF panel', conjugate: 'Alexa Fluor 647', clone: 'SolA15', company: 'Thermo Fisher', catalog: '51-5698-82', location: 'Fridge 2, box B', files: [] }, one(45, 'µL', 20));

  // Reagents & media
  rec('reagents', { name: 'PBS (1x)', type: 'Buffer', company: 'Gibco', catalog: '10010023', size: '500 mL', location: 'Shelf 3', hazards: [], files: [] }, one(6, 'bottles', 2));
  const bsa = rec('reagents', { name: 'BSA, fraction V', type: 'Reagent', company: 'Sigma-Aldrich', catalog: 'A9418', size: '100 g', location: 'Fridge 1', hazards: [], files: [] }, one(40, 'g', 10));
  rec('reagents', { name: 'DAPI', type: 'Chemical', company: 'Thermo Fisher', catalog: 'D1306', size: '10 mg', location: 'Freezer −20 °C, drawer 2', hazards: ['Irritant / harmful', 'Health hazard'], flag: 'Orange', expiry: iso(-5), files: [] }, one(1, 'vials', 1));
  rec('reagents', { name: 'DMEM, high glucose', type: 'Medium', company: 'Gibco', catalog: '41965039', size: '500 mL', location: 'Fridge 3', opened: iso(-12), expiry: iso(40), hazards: [], files: [] }, one(4, 'bottles', 2));
  rec('reagents', { name: 'Methanol', type: 'Chemical', company: 'VWR', catalog: '20847.307', size: '2.5 L', location: 'Flammables cabinet', hazards: ['Flammable', 'Toxic', 'Health hazard'], flag: 'Red', files: [] }, one(2, 'bottles', 1));

  rec('reagents', { name: 'Sodium hydroxide, 1 M', type: 'Chemical', company: 'Merck', catalog: '1.09137', size: '1 L', location: 'Corrosives cabinet', hazards: ['Corrosive'], flag: 'Yellow', files: [] }, one(3, 'bottles', 1));
  rec('reagents', { name: 'Paraformaldehyde 4%', type: 'Chemical', company: 'Thermo Fisher', catalog: 'J61899', size: '500 mL', location: 'Fume hood cabinet', hazards: ['Flammable', 'Irritant / harmful', 'Health hazard'], flag: 'Red', files: [] }, one(2, 'bottles', 1));

  // Kits, primers, plasmids
  rec('kits', { name: 'RNeasy Mini Kit', company: 'Qiagen', catalog: '74104', lot: '172034', location: 'Shelf 1', expiry: iso(180), files: [] }, one(2, 'kits', 1));
  rec('kits', { name: 'Opal 6-Plex Detection Kit', company: 'Akoya', catalog: 'NEL871001KT', location: 'Fridge 1', expiry: iso(90), files: [] }, one(1, 'kits', 1));
  rec('primers', { name: 'GAPDH forward', sequence: 'GTCTCCTCTGACTTCAACAGCG', orientation: 'Forward', application: 'qPCR', stockConc: 100, workConc: 10, tm: 60, location: 'Freezer −20 °C, primer box 1' }, one(180, 'µL', 50));
  rec('primers', { name: 'GAPDH reverse', sequence: 'ACCACCCTGTTGCTGTAGCCAA', orientation: 'Reverse', application: 'qPCR', stockConc: 100, workConc: 10, tm: 61, location: 'Freezer −20 °C, primer box 1' }, one(35, 'µL', 50));
  rec('plasmids', { name: 'pLenti-CMV-GFP', plasmidId: 'pWL001', backbone: 'pLenti', vectorType: 'Lentiviral', insert: 'EGFP', insertSize: 720, promoter: 'CMV', resistance: 'AmpR', selection: 'Puromycin', concentration: '850 ng/µL', location: 'Freezer −20 °C, plasmid box', files: [] }, one(40, 'µL', 5));

  // Cell lines
  const mda = rec('celllines', { name: 'MDA-MB-231', passage: 12, frozen: iso(-60), location: 'LN2 tank, rack 3', origin: 'ATCC HTB-26', mycoplasma: 'Negative', files: [] }, one(5, 'vials', 2));
  rec('celllines', { name: 'MCF7', passage: 8, frozen: iso(-120), location: 'LN2 tank, rack 3', origin: 'ATCC HTB-22', mycoplasma: 'Negative', files: [] }, one(1, 'vials', 2));

  // Mice / PDX (counted per organ)
  const m823 = rec('mice', { name: '823', model: 'HCI010', year: 2025, location: '−80 °C, rack B', notes: 'Passage 4, untreated.', files: [] }, { parts: { pt: 3, lung: 2, liver: 2, bm: 1 }, unit: 'pcs' });
  rec('mice', { name: '824', model: 'HCI010', year: 2025, location: '−80 °C, rack B', files: [] }, { parts: { pt: 2, lung: 3, brain: 1 }, unit: 'pcs' });
  rec('mice', { name: '901', model: 'HCI002', year: 2026, location: '−80 °C, rack C', files: [] }, { parts: { pt: 4, lung: 1, ovary: 2 }, unit: 'pcs' });

  // Protocols (reference only)
  const ifProt = rec('protocols', { name: 'Multiplex IF on FFPE sections', version: '2.1', summary: 'Single-round immunofluorescence on FFPE tissue, used to validate antibodies before MACSima runs.',
    materials: [['PBS (1x)', '500', 'mL', 'room temperature'], ['BSA, fraction V', '1', 'g', '1% in PBS, prepare fresh'], ['DAPI', '1', 'µL', '1:1000 in PBS']],
    procedure: '<h3>Deparaffinize and retrieve</h3><ol><li>Bake slides 1 h at 60 °C.</li><li>Xylene 2 × 5 min, ethanol series, water.</li><li>Antigen retrieval in citrate pH 6, 20 min at 95 °C.</li></ol><h3>Stain</h3><ol><li>Block in 1% BSA for 1 h.</li><li>Primary antibody overnight at 4 °C.</li><li>Wash 3 × 5 min in PBS, then DAPI 5 min.</li></ol>',
    files: [] });
  rec('protocols', { name: 'Thawing frozen cell lines', version: '1.0', summary: 'Quick thaw at 37 °C and wash out DMSO before plating.', materials: [['DMEM, high glucose', '10', 'mL', 'pre-warmed']], procedure: '<ol><li>Thaw vial in a 37 °C water bath for 1–2 min.</li><li>Transfer into 10 mL warm medium and spin 5 min at 300 g.</li><li>Resuspend and plate.</li></ol>', files: [] });

  // Order links (supplier search pages for each catalog number). CD3 and Methanol are left without one on purpose.
  const links = {
    'CD45': 'https://www.biolegend.com/en-us/search-results?Keywords=304012',
    'CD68': 'https://www.abcam.com/en-us/search?keywords=ab955',
    'EpCAM': 'https://www.miltenyibiotec.com/search?query=130-111-116',
    'Ki-67': 'https://www.thermofisher.com/search/results?query=51-5698-82',
    'PBS (1x)': 'https://www.thermofisher.com/search/results?query=10010023',
    'BSA, fraction V': 'https://www.sigmaaldrich.com/search/a9418?focus=products',
    'DAPI': 'https://www.thermofisher.com/search/results?query=D1306',
    'DMEM, high glucose': 'https://www.thermofisher.com/search/results?query=41965039',
    'RNeasy Mini Kit': 'https://www.qiagen.com/search?query=74104',
    'Opal 6-Plex Detection Kit': 'https://www.akoyabio.com/?s=NEL871001KT',
    'GAPDH forward': 'https://www.idtdna.com/pages/products/custom-dna-rna/dna-oligos',
    'GAPDH reverse': 'https://www.idtdna.com/pages/products/custom-dna-rna/dna-oligos',
    'MDA-MB-231': 'https://www.atcc.org/products/htb-26',
    'MCF7': 'https://www.atcc.org/products/htb-22'
  };
  records.forEach(r => {
    const u = links[r.data.name];
    if (!u) return;
    const f = orderField(mods.find(m => m.id === r.moduleId));
    if (f) r.data[f.key] = u;
  });
  rec('plasmids', { name: 'psPAX2', plasmidId: 'pWL002', backbone: 'psPAX2', vectorType: 'Lentiviral', addgeneLink: 'https://www.addgene.org/12260/', resistance: 'AmpR', location: 'Freezer −20 °C, plasmid box', files: [] }, one(25, 'µL', 5));

  // Experiments: one final, one draft. Stock above already reflects what they reserved.
  const item = (r, amount, part = '') => ({ recordId: r.id, moduleId: r.moduleId, part, name: r.data.name + (part ? ` — ${partLabel(modById(r.moduleId) || mod('mice'), part)}` : ''), unit: r.unit || 'pcs', amount });
  const exp = (title, offset, status, items, extra) => {
    const id = newId();
    return { id, title, date: iso(offset), user: who, projectId: '', aim: '', items, refs: [], result: '', next: '', notes: '', files: [],
      status, stockReserved: true, reservedItems: items, createdAt: now + offset * day, createdBy: who, createdByUid: user.uid, createdByEmail: '', updatedAt: now + offset * day, ...extra };
  };
  // partLabel needs the module list; give it the template module directly.
  const mouseMod = mod('mice');
  const lungItem = { recordId: m823.id, moduleId: m823.moduleId, part: 'lung', name: `823 — ${mouseMod.stock.parts.find(p => p.key === 'lung').label}`, unit: 'pcs', amount: 1 };
  const projectId = newId();
  const e1 = exp('CD68 validation on HCI010 lung', -9, 'final',
    [{ ...item(cd68, 10), unit: 'µL' }, { ...item(bsa, 1), unit: 'g' }, lungItem],
    { projectId, aim: 'Check that the CD68 clone KP1 stains macrophages in PDX lung metastases.',
      refs: [{ recordId: ifProt.id, moduleId: ifProt.moduleId, name: ifProt.data.name }],
      result: '<p>Clear membrane staining of macrophages around metastatic nests. No signal in the isotype control.</p>',
      next: '<ul><li>Repeat on HCI002 tissue.</li><li>Order more CD68 — stock is low.</li></ul>', finalizedAt: now - 8 * day });
  const e2 = exp('FACS of MDA-MB-231 co-culture', -1, 'draft',
    [{ ...item(cd45, 20), unit: 'µL' }, { ...item(epcam, 10), unit: 'µL' }, { ...item(mda, 1), unit: 'vials' }],
    { projectId, aim: 'Measure immune cell infiltration in a tumour–monocyte co-culture.' });

  const project = { id: projectId, name: 'Myeloid cells in metastasis', desc: 'Example project: links the antibodies, models and experiments of one study.',
    links: [cd45.id, cd68.id, epcam.id, m823.id, mda.id], createdAt: now - 30 * day, createdBy: who };

  const logs = [
    [-20, 'Created the lab "Demo Lab"'], [-12, 'Added antibody “CD68” to Antibodies'], [-9, 'Finalized experiment “CD68 validation on HCI010 lung”'],
    [-1, 'Saved draft experiment “FACS of MDA-MB-231 co-culture” and reserved 3 items']
  ].map(([d, desc], i) => { const ts = now + d * day + i; return ['set', 'log', ts + '-demo', { ts, user: who, uid: user.uid, desc }]; });

  await App.store.batch([
    ['set', 'meta', 'lab', { name: 'Demo Lab', ownerUid: user.uid, createdAt: now - 20 * day, demo: true }],
    ['set', 'members', user.uid, { uid: user.uid, name: who, email: '', role: 'admin', joinedAt: now - 20 * day }],
    ...mods.map(m => ['set', 'modules', m.id, m]),
    ...records.map(r => ['set', 'records', r.id, r]),
    ['set', 'projects', project.id, project],
    ['set', 'experiments', e1.id, e1], ['set', 'experiments', e2.id, e2],
    ...logs
  ]);
}
