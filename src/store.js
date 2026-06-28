// Savefile state: all user-created data (SPEC §10). Lives in localStorage,
// importable/exportable as one portable JSON document. Never bundled with the app.

const LS_KEY = 'dextracker.savefile.v1';
const SCHEMA_VERSION = 1;

const listeners = new Set();
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn(state)); }

export function emptySave() {
  return {
    meta: {
      source: 'DexTracker PWA',
      description: 'Portable user data for DexTracker (SPEC §10).',
      schema_version: SCHEMA_VERSION,
    },
    species_ownership: [],
    form_ownership: [],
    per_game_ownership: {},
    ot_registry: [],
    hall_of_fame: [],
    switch_profiles: [],
    cooking_recipes: [],
    ui: {},
  };
}

export let state = emptySave();

// ---- Indexes rebuilt on load/import for O(1) lookups ----
const index = {
  species: new Map(),   // national_no -> ownership row
  forms: new Map(),     // key -> ownership row
  perGame: new Map(),   // dexId -> Map(national_no -> row)
  ot: new Map(),        // "ot|tid" -> registry row
};

export function formKey(nat, formCode, form) {
  return `${nat || ''}|${formCode || ''}|${form || ''}`;
}
export function otKey(ot, tid) {
  return `${(ot || '').trim()}|${(tid || '').trim()}`;
}

function reindex() {
  index.species.clear();
  index.forms.clear();
  index.perGame.clear();
  index.ot.clear();
  (state.species_ownership || []).forEach((r) => index.species.set(r.national_no, r));
  (state.form_ownership || []).forEach((r) => index.forms.set(formKey(r.national_no, r.form_code, r.form), r));
  Object.entries(state.per_game_ownership || {}).forEach(([dexId, rows]) => {
    const m = new Map();
    (rows || []).forEach((r) => m.set(r.national_no, r));
    index.perGame.set(dexId, m);
  });
  (state.ot_registry || []).forEach((r) => index.ot.set(otKey(r.ot, r.tid), r));
}

export function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      state = normalize(JSON.parse(raw));
      reindex();
      return true;
    }
  } catch (e) { console.warn('Failed to load savefile from localStorage', e); }
  state = emptySave();
  reindex();
  return false;
}

export function persist() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch (e) { console.warn('Failed to persist savefile', e); }
}

function normalize(obj) {
  const base = emptySave();
  return {
    meta: obj.meta || base.meta,
    species_ownership: obj.species_ownership || [],
    form_ownership: obj.form_ownership || [],
    per_game_ownership: obj.per_game_ownership || {},
    ot_registry: obj.ot_registry || [],
    // A HoF "team" is one champion run. Legacy rows had no team_id, so distinct
    // runs of the same game collapsed together — group those by game so they keep
    // their old appearance, while new rows carry a unique team_id.
    hall_of_fame: (obj.hall_of_fame || []).map((r) => (r.team_id ? r : { ...r, team_id: `g:${r.game || 'Unknown'}` })),
    switch_profiles: obj.switch_profiles || [],
    cooking_recipes: obj.cooking_recipes || [],
    ui: obj.ui || {},
  };
}

export function importSave(obj) {
  state = normalize(obj);
  reindex();
  persist();
  emit();
}

export function resetSave() {
  state = emptySave();
  reindex();
  persist();
  emit();
}

export function exportSave() {
  return JSON.stringify(state, null, 2);
}

// Called after a mutation: persist + notify (without rebuilding the whole index
// unless structure changed). Use touch() for in-place edits.
export function commit({ reindex: doReindex = false } = {}) {
  if (doReindex) reindex();
  persist();
  emit();
}

// ---- Ownership accessors ----
export function isOwned(slot) {
  return !!(slot && String(slot.ot || '').trim() && String(slot.tid || '').trim());
}

export function getSpeciesRow(nat) { return index.species.get(nat); }
export function getSpeciesSlot(nat, shiny) {
  const r = index.species.get(nat);
  if (!r) return null;
  return shiny ? r.shiny : r.normal;
}

export function setSpeciesSlot(nat, shiny, ot, tid) {
  let r = index.species.get(nat);
  if (!r) {
    r = { national_no: nat };
    state.species_ownership.push(r);
    index.species.set(nat, r);
  }
  const key = shiny ? 'shiny' : 'normal';
  if (!ot && !tid) delete r[key];
  else r[key] = { ot: ot || '', tid: tid || '' };
  commit();
}

export function getFormRow(nat, formCode, form) { return index.forms.get(formKey(nat, formCode, form)); }
export function getFormSlot(nat, formCode, form, shiny) {
  const r = index.forms.get(formKey(nat, formCode, form));
  if (!r) return null;
  return shiny ? r.shiny : r.normal;
}
export function setFormSlot(nat, formCode, form, shiny, ot, tid) {
  const k = formKey(nat, formCode, form);
  let r = index.forms.get(k);
  if (!r) {
    r = { national_no: nat, form, form_code: formCode };
    state.form_ownership.push(r);
    index.forms.set(k, r);
  }
  const key = shiny ? 'shiny' : 'normal';
  if (!ot && !tid) delete r[key];
  else r[key] = { ot: ot || '', tid: tid || '' };
  commit();
}

export function getPerGameRow(dexId, nat) {
  const m = index.perGame.get(dexId);
  return m ? m.get(nat) : null;
}
export function setPerGameSlot(dexId, nat, regionalNo, ot, tid, isMine) {
  let m = index.perGame.get(dexId);
  if (!m) {
    m = new Map();
    index.perGame.set(dexId, m);
    state.per_game_ownership[dexId] = state.per_game_ownership[dexId] || [];
  }
  let r = m.get(nat);
  if (!ot && !tid) {
    if (r) {
      state.per_game_ownership[dexId] = state.per_game_ownership[dexId].filter((x) => x !== r);
      m.delete(nat);
    }
    commit();
    return;
  }
  if (!r) {
    r = { national_no: nat, regional_no: regionalNo };
    state.per_game_ownership[dexId] = state.per_game_ownership[dexId] || [];
    state.per_game_ownership[dexId].push(r);
    m.set(nat, r);
  }
  r.ot = ot || '';
  r.tid = tid || '';
  r.is_mine = !!isMine;
  commit();
}

// ---- Hall of Fame ----
// Rows have no stable key, so callers pass the row reference itself to edit/remove.
export function addHofEntry(entry) {
  state.hall_of_fame = state.hall_of_fame || [];
  state.hall_of_fame.push(entry);
  commit();
}
export function updateHofEntry(row, patch) {
  if (!row) return;
  Object.assign(row, patch);
  commit();
}
export function removeHofEntry(row) {
  state.hall_of_fame = (state.hall_of_fame || []).filter((x) => x !== row);
  commit();
}
// Swap two rows' positions in the flat list. Teams are derived by grouping that
// list in order, so swapping two same-team members reorders them within the team
// without disturbing other teams.
export function swapHofEntries(a, b) {
  const arr = state.hall_of_fame || [];
  const ia = arr.indexOf(a), ib = arr.indexOf(b);
  if (ia < 0 || ib < 0 || ia === ib) return;
  [arr[ia], arr[ib]] = [arr[ib], arr[ia]];
  commit();
}

export function getOtEntry(ot, tid) { return index.ot.get(otKey(ot, tid)); }
export function upsertOtEntry(entry) {
  const k = otKey(entry.ot, entry.tid);
  const existing = index.ot.get(k);
  if (existing) {
    Object.assign(existing, entry);
  } else {
    state.ot_registry.push(entry);
    index.ot.set(k, entry);
  }
  commit();
}
export function removeOtEntry(ot, tid) {
  const k = otKey(ot, tid);
  const existing = index.ot.get(k);
  if (existing) {
    state.ot_registry = state.ot_registry.filter((x) => x !== existing);
    index.ot.delete(k);
    commit();
  }
}
