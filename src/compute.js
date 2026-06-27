// Derived/computed logic (SPEC §5). All recomputed from user data + seed data.

import { REF, idx, spriteUrl, speciesName } from './data.js';
import * as store from './store.js';

// Resolve a slot's (OT,TID) to rich origin metadata via the OT registry + Game Ref.
export function resolveOrigin(ot, tid) {
  const reg = store.getOtEntry(ot, tid);
  if (!reg) return { game: null, gameId: null, iconUrl: null, markUrl: null, markCode: null, isMine: null, isGo: null, description: null, registered: false };
  const game = idx.gameById.get(reg.game) || null;
  return {
    game: reg.game,
    gameId: reg.game,
    iconUrl: game ? game.icon_url : null,
    markUrl: game ? game.mark_url : null,
    markCode: game ? game.mark_code : null,
    isMine: reg.is_mine,
    isGo: reg.is_go,
    profile: reg.profile,
    description: reg.description,
    registered: true,
  };
}

// Build the ordered entry list for a given dex.
// Returns { dex, entries:[ {national_no, regional_no, name, source, shiny, formCode, formCodeShiny, slotKind, dexId, group} ], hasRegional, isForm }
export function buildDexEntries(dexId) {
  const dex = idx.dexById.get(dexId);
  if (!dex) return { dex: null, entries: [], hasRegional: false, isForm: false };

  // National / Shiny National dex -> species master
  if (dexId === 'Nat Dex' || dexId === 'Shiny Nat Dex') {
    const shiny = dexId === 'Shiny Nat Dex';
    const entries = REF.species.map((s) => ({
      national_no: s.national_no,
      regional_no: s.national_no,
      name: s.name,
      source: 'home',
      shiny,
      formCode: '',
      formCodeShiny: '',
      slotKind: 'species',
      dexId,
      type1: s.type1, type2: s.type2,
      serebii_link: s.serebii_link,
    }));
    return { dex, entries, hasRegional: true, isForm: false };
  }

  // Form / Shiny Form dex -> forms master (grouped)
  if (dexId === 'Nat Form Dex' || dexId === 'Shiny Nat Form Dex') {
    const shiny = dexId === 'Shiny Nat Form Dex';
    const entries = REF.forms.map((f) => ({
      national_no: f.national_no,
      regional_no: null,
      name: `${f.form} ${f.name}`,
      baseName: f.name,
      form: f.form,
      source: 'home',
      shiny,
      formCode: f.form_code || '',
      formCodeShiny: f.form_code || '',
      slotKind: 'form',
      dexId,
      group: f.box_group || 'Forms',
      serebii_link: f.serebii_link,
    }));
    return { dex, entries, hasRegional: false, isForm: true };
  }

  // Per-game dex -> dex_mappings
  const mappings = REF.dexMappings[dexId] || [];
  const entries = mappings.map((m) => ({
    national_no: m.national_no,
    regional_no: m.regional_no,
    name: speciesName(m.national_no),
    source: dex.sprite_source,
    shiny: false,
    formCode: m.form_code || '',
    formCodeShiny: m.form_code_shiny || m.form_code || '',
    slotKind: 'pergame',
    dexId,
    serebii_link: idx.speciesByNat.get(m.national_no)?.serebii_link,
  }));
  return { dex, entries, hasRegional: dex.has_regional_no, isForm: false };
}

// Get the ownership slot {ot,tid,is_mine?} for an entry.
export function entrySlot(e) {
  if (e.slotKind === 'species') return store.getSpeciesSlot(e.national_no, e.shiny);
  if (e.slotKind === 'form') return store.getFormSlot(e.national_no, e.formCode, e.form, e.shiny);
  if (e.slotKind === 'pergame') return store.getPerGameRow(e.dexId, e.national_no);
  return null;
}

export function entryOwned(e) {
  return store.isOwned(entrySlot(e));
}

// Sprite URL for an entry (respects shiny variant + form code).
export function entrySprite(e) {
  const variant = e.shiny ? 'shiny' : 'normal';
  const code = e.shiny ? e.formCodeShiny : e.formCode;
  return spriteUrl(e.source, variant, e.national_no, code);
}

// ---- Statistics (SPEC §6) ----
export function computeStats() {
  const out = { national: tallySpecies(false), shinyNational: tallySpecies(true),
                forms: tallyForms(false), shinyForms: tallyForms(true),
                bySource: bySource(), perGame: perGameStats() };
  return out;
}

function tallySpecies(shiny) {
  let owned = 0, go = 0;
  const total = REF.species.length;
  REF.species.forEach((s) => {
    const slot = store.getSpeciesSlot(s.national_no, shiny);
    if (store.isOwned(slot)) {
      owned++;
      const o = resolveOrigin(slot.ot, slot.tid);
      if (o.isGo) go++;
    }
  });
  return { total, owned, missing: total - owned, go };
}

function tallyForms(shiny) {
  let owned = 0, go = 0;
  const total = REF.forms.length;
  REF.forms.forEach((f) => {
    const slot = store.getFormSlot(f.national_no, f.form_code, f.form, shiny);
    if (store.isOwned(slot)) {
      owned++;
      const o = resolveOrigin(slot.ot, slot.tid);
      if (o.isGo) go++;
    }
  });
  return { total, owned, missing: total - owned, go };
}

// Owned National-dex Pokémon grouped by origin game (normal + shiny).
function bySource() {
  const rows = new Map();
  const add = (gameId, shiny) => {
    if (!rows.has(gameId)) rows.set(gameId, { game: gameId, normal: 0, shiny: 0 });
    const r = rows.get(gameId);
    if (shiny) r.shiny++; else r.normal++;
  };
  REF.species.forEach((s) => {
    const n = store.getSpeciesSlot(s.national_no, false);
    if (store.isOwned(n)) add(resolveOrigin(n.ot, n.tid).game || 'N/A', false);
    const sh = store.getSpeciesSlot(s.national_no, true);
    if (store.isOwned(sh)) add(resolveOrigin(sh.ot, sh.tid).game || 'N/A', true);
  });
  const total = REF.species.length;
  return [...rows.values()]
    .map((r) => ({ ...r, icon: idx.gameById.get(r.game)?.icon_url || null,
                   normalPct: Math.round((r.normal / total) * 1000) / 10,
                   shinyPct: Math.round((r.shiny / total) * 1000) / 10 }))
    .sort((a, b) => (b.normal + b.shiny) - (a.normal + a.shiny));
}

function perGameStats() {
  return REF.dexes
    .filter((d) => REF.dexMappings[d.id])
    .map((d) => {
      const mappings = REF.dexMappings[d.id];
      const total = mappings.length;
      let owned = 0;
      mappings.forEach((m) => {
        if (store.isOwned(store.getPerGameRow(d.id, m.national_no))) owned++;
      });
      return { id: d.id, name: d.name, total, owned, missing: total - owned,
               pct: total ? Math.round((owned / total) * 1000) / 10 : 0 };
    });
}
