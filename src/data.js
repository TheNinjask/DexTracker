// Reference data loader + indexes + sprite composition + box math.
// Reference data is app-managed seed data (SPEC.md §3). Loaded once at boot.

export const REF = {
  meta: null,
  species: [],
  forms: [],
  types: [],
  games: [],
  dexes: [],
  dexMappings: {},
  imageSources: {},
  berries: [],
};

// Indexes
export const idx = {
  speciesByNat: new Map(), // "0001" -> species
  typeByName: new Map(),
  gameById: new Map(),
  gameByIdLower: new Map(), // case-insensitive fallback for registry game names
  dexById: new Map(),
  berryById: new Map(),
};

// Tools (Tools tab): a per-game hub of small utilities, e.g. Legends Z-A's Donut
// Maker. Independent of REF.games (the dex/OT-origin game list) since a tool's
// "game" is just a grouping label, not a dex/origin source — kept in its own
// reference file (tools_data.json) and its own indexes.
export const TOOLS = { games: [], tools: [] };
export const toolIdx = {
  gameById: new Map(),
  toolById: new Map(),
};

// Hyperspace Wild Zone data (Legends Z-A's "Searcher" tool): each zone is a
// {type, star, species[]} portal pool. Its own file/singleton since it's
// specific to that one tool, not general dex/species reference data.
export const HYPERSPACE = { zones: [] };

// Challenges (Pokémon HOME) + Research Tasks (per-game), each in its own file/
// singleton — same reasoning as TOOLS/HYPERSPACE above.
export const CHALLENGES = { meta: null, sections: [], challenges: [] };
export const RESEARCH = { games: [], tasks: [] };
export const challengeIdx = { byId: new Map() };
export const researchIdx = { gameById: new Map(), byId: new Map() };

// Resolve a game by id, tolerating case differences between user-entered
// registry game names (e.g. "Home/GO") and reference ids ("Home/Go").
export function findGame(id) {
  if (id == null) return null;
  return idx.gameById.get(id) || idx.gameByIdLower.get(String(id).toLowerCase()) || null;
}

// Games sorted alphabetically by id, for the game pickers in the OT Registry,
// Hall of Fame and Profiles. Returns a copy so the canonical REF.games order
// (used elsewhere, e.g. stats) is left untouched.
export function gamesAlpha() {
  return [...REF.games].sort((a, b) =>
    String(a.id).localeCompare(String(b.id), undefined, { sensitivity: 'base' }));
}

// Rebuild every index from the current REF arrays. Called once after the initial
// load and again after any in-app reference-data edit (see the dev editor), so the
// lookups stay consistent with the mutated REF.
export function rebuildIndexes() {
  idx.speciesByNat.clear();
  idx.typeByName.clear();
  idx.gameById.clear();
  idx.gameByIdLower.clear();
  idx.dexById.clear();
  idx.berryById.clear();
  REF.species.forEach((s) => idx.speciesByNat.set(s.national_no, s));
  REF.types.forEach((t) => idx.typeByName.set(t.name, t));
  REF.games.forEach((g) => { idx.gameById.set(g.id, g); idx.gameByIdLower.set(String(g.id).toLowerCase(), g); });
  REF.dexes.forEach((d) => idx.dexById.set(d.id, d));
  REF.berries.forEach((b) => idx.berryById.set(b.id, b));
}

export async function loadReferenceData() {
  // Static seed data lives in public/ → served at <base>/data/. BASE_URL is '/' in dev
  // and '/<repo>/' in the GitHub Pages build. Cooking (berry) and Tools data each ship
  // as their own file since they're separate domains from the dex/species reference data.
  const base = import.meta.env.BASE_URL;
  const [refRes, cookingRes, toolsRes, hyperspaceRes, challengeRes, researchRes] = await Promise.all([
    fetch(`${base}data/reference_data.json`),
    fetch(`${base}data/cooking_data.json`),
    fetch(`${base}data/tools_data.json`),
    fetch(`${base}data/hyperspace_wild_zone.json`),
    fetch(`${base}data/challenge_data.json`),
    fetch(`${base}data/reasearch_task_data.json`),
  ]);
  if (!refRes.ok) throw new Error('Failed to load reference_data.json: ' + refRes.status);
  if (!cookingRes.ok) throw new Error('Failed to load cooking_data.json: ' + cookingRes.status);
  if (!toolsRes.ok) throw new Error('Failed to load tools_data.json: ' + toolsRes.status);
  if (!hyperspaceRes.ok) throw new Error('Failed to load hyperspace_wild_zone.json: ' + hyperspaceRes.status);
  if (!challengeRes.ok) throw new Error('Failed to load challenge_data.json: ' + challengeRes.status);
  if (!researchRes.ok) throw new Error('Failed to load reasearch_task_data.json: ' + researchRes.status);
  const data = await refRes.json();
  const cooking = await cookingRes.json();
  const tools = await toolsRes.json();
  const hyperspace = await hyperspaceRes.json();
  const challenge = await challengeRes.json();
  const research = await researchRes.json();
  REF.meta = data.meta;
  REF.species = data.species || [];
  REF.forms = data.forms || [];
  REF.types = data.types || [];
  REF.games = data.games || [];
  REF.dexes = data.dexes || [];
  REF.dexMappings = data.dex_mappings || {};
  REF.imageSources = data.image_sources || {};
  REF.berries = cooking.berries || [];
  TOOLS.games = tools.games || [];
  TOOLS.tools = tools.tools || [];
  toolIdx.gameById.clear();
  toolIdx.toolById.clear();
  TOOLS.games.forEach((g) => toolIdx.gameById.set(g.id, g));
  TOOLS.tools.forEach((t) => toolIdx.toolById.set(t.id, t));
  HYPERSPACE.zones = hyperspace.zones || [];

  CHALLENGES.meta = challenge.meta || null;
  CHALLENGES.sections = challenge.sections || [];
  CHALLENGES.challenges = challenge.challenges || [];
  challengeIdx.byId.clear();
  CHALLENGES.challenges.forEach((c) => challengeIdx.byId.set(c.id, c));

  RESEARCH.games = research.games || [];
  RESEARCH.tasks = research.tasks || [];
  researchIdx.gameById.clear();
  researchIdx.byId.clear();
  RESEARCH.games.forEach((g) => researchIdx.gameById.set(g.id, g));
  RESEARCH.tasks.forEach((t) => researchIdx.byId.set(t.id, t));

  rebuildIndexes();
  return REF;
}

// ---- Reference-data editing (dev mode only; SPEC §3 is seed data, normally read-only) ----
// These mutate the in-memory REF and reindex. Nothing is persisted — the dev editor
// exports an updated reference_data.json (exportReferenceData below) to commit to the repo.

// Reference keys are stored zero-padded to 4 digits ("0001"). Normalize any typed
// national/regional number to that form so lookups (speciesByNat, sprites) line up.
export function pad4(v) {
  const digits = String(v == null ? '' : v).replace(/\D/g, '');
  return digits ? digits.padStart(4, '0') : '';
}

export function upsertSpecies(row) {
  const nat = pad4(row.national_no);
  const next = { ...row, national_no: nat };
  const i = REF.species.findIndex((s) => s.national_no === nat);
  if (i >= 0) REF.species[i] = { ...REF.species[i], ...next };
  else REF.species.push(next);
  rebuildIndexes();
}
export function removeSpecies(nationalNo) {
  const nat = pad4(nationalNo);
  REF.species = REF.species.filter((s) => s.national_no !== nat);
  rebuildIndexes();
}

// form_code alone isn't always unique per species (e.g. Gigantamax Toxtricity), so match form + form_code_base too.
export function upsertForm(row) {
  const nat = pad4(row.national_no);
  const next = { ...row, national_no: nat };
  const i = REF.forms.findIndex((f) => f.national_no === nat && f.form_code === row.form_code
    && f.form === row.form && (f.form_code_base || '') === (row.form_code_base || ''));
  if (i >= 0) REF.forms[i] = { ...REF.forms[i], ...next };
  else REF.forms.push(next);
  rebuildIndexes();
}
export function removeForm(nationalNo, formCode, form, formCodeBase) {
  const nat = pad4(nationalNo);
  REF.forms = REF.forms.filter((f) => !(f.national_no === nat && f.form_code === formCode
    && f.form === form && (f.form_code_base || '') === (formCodeBase || '')));
  rebuildIndexes();
}

export function upsertDex(row) {
  const i = REF.dexes.findIndex((d) => d.id === row.id);
  if (i >= 0) REF.dexes[i] = { ...REF.dexes[i], ...row };
  else REF.dexes.push({ ...row });
  rebuildIndexes();
}
export function removeDex(id) {
  REF.dexes = REF.dexes.filter((d) => d.id !== id);
  if (REF.dexMappings[id]) delete REF.dexMappings[id];
  rebuildIndexes();
}

// dex_mappings[dexId] is an array of { regional_no, national_no }, keyed (within a
// dex) by national_no.
export function setDexMapping(dexId, rows) {
  REF.dexMappings[dexId] = rows;
}
export function upsertMappingRow(dexId, row) {
  const nat = pad4(row.national_no);
  const entry = { regional_no: pad4(row.regional_no), national_no: nat };
  const arr = REF.dexMappings[dexId] || (REF.dexMappings[dexId] = []);
  const i = arr.findIndex((m) => m.national_no === nat);
  if (i >= 0) arr[i] = entry;
  else arr.push(entry);
}
export function removeMappingRow(dexId, nationalNo) {
  const nat = pad4(nationalNo);
  const arr = REF.dexMappings[dexId];
  if (arr) REF.dexMappings[dexId] = arr.filter((m) => m.national_no !== nat);
}

// Games carry origin icon/mark imagery (OT registry, HoF, profiles). Key: id.
export function upsertGame(row) {
  const i = REF.games.findIndex((g) => g.id === row.id);
  if (i >= 0) REF.games[i] = { ...REF.games[i], ...row };
  else REF.games.push({ ...row });
  rebuildIndexes();
}
export function removeGame(id) {
  REF.games = REF.games.filter((g) => g.id !== id);
  rebuildIndexes();
}

// image_sources: { [name]: { [variant]: { prefix, suffix } } } — sprite URL
// templates a dex's sprite_source points at. Not indexed (spriteUrl reads REF
// directly), so these need no reindex.
export function addImageSource(name) {
  if (name && !REF.imageSources[name]) REF.imageSources[name] = {};
}
export function renameImageSource(oldName, newName) {
  if (!newName || oldName === newName || !REF.imageSources[oldName] || REF.imageSources[newName]) return;
  // Rebuild preserving key order so the export diff stays minimal.
  const next = {};
  Object.keys(REF.imageSources).forEach((k) => { next[k === oldName ? newName : k] = REF.imageSources[k]; });
  REF.imageSources = next;
}
export function removeImageSource(name) {
  delete REF.imageSources[name];
}
export function setImageVariant(sourceName, variant, prefix, suffix) {
  const src = REF.imageSources[sourceName] || (REF.imageSources[sourceName] = {});
  src[variant] = { prefix: prefix || '', suffix: suffix || '' };
}
export function removeImageVariant(sourceName, variant) {
  const src = REF.imageSources[sourceName];
  if (src) delete src[variant];
}

// Serialize the full reference dataset back to the on-disk shape (4-space indent,
// original top-level key order) so a committed diff only shows the edited records.
// Cooking (berry) data lives in its own file (cooking_data.json) and isn't
// editable here, so it's excluded.
export function exportReferenceData() {
  return JSON.stringify({
    meta: REF.meta,
    species: REF.species,
    forms: REF.forms,
    types: REF.types,
    games: REF.games,
    dexes: REF.dexes,
    dex_mappings: REF.dexMappings,
    image_sources: REF.imageSources,
  }, null, 4);
}

// Berry sprite URL. The source workbook composed berry images as
//   IMAGE(CONCAT("https://serebii.net/itemdex/sprites/za/th/", id, ".png"))
// where id is the space-stripped lowercase berry name — exactly our berry id
// (e.g. "cheriberry", "hypercheriberry"). Serebii has no CORS header, so these
// load as plain (opaque) images via icon() (see dom.js).
const BERRY_SPRITE_BASE = 'https://serebii.net/itemdex/sprites/za/th/';
export function berrySpriteUrl(id) {
  return id ? `${BERRY_SPRITE_BASE}${id}.png` : '';
}

export function speciesName(nat) {
  const s = idx.speciesByNat.get(nat);
  return s ? s.name : '???';
}

// pad3: zero-pad National No. to a MINIMUM of 3 digits (SPEC §3.5).
// national_no keys are stored 4-digit ("0001"); strip then re-pad to >=3.
export function pad3(nationalNo) {
  const n = parseInt(nationalNo, 10);
  if (Number.isNaN(n)) return nationalNo;
  return String(n).padStart(3, '0');
}

// Compose a sprite URL per SPEC §3.5:
//   url = prefix + pad3(national_no) + form_code + suffix
export function spriteUrl(sourceCode, variant, nationalNo, formCode = '') {
  const src = REF.imageSources[sourceCode];
  if (!src) return '';
  const v = src[variant] || src.normal;
  if (!v) return '';
  return v.prefix + pad3(nationalNo) + (formCode || '') + v.suffix;
}

// Box placement math (SPEC §2.2). n is a 1-based sequence number.
export function boxOf(n) {
  return Math.floor((n - 1) / 30) + 1;
}
export function positionOf(n) {
  return ((n - 1) % 30) + 1;
}

export const BOX_SIZE = 30;
