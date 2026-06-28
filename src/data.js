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

export async function loadReferenceData() {
  // Static seed data lives in public/ → served at <base>/data/. BASE_URL is '/' in dev
  // and '/<repo>/' in the GitHub Pages build.
  const res = await fetch(`${import.meta.env.BASE_URL}data/reference_data.json`);
  if (!res.ok) throw new Error('Failed to load reference_data.json: ' + res.status);
  const data = await res.json();
  REF.meta = data.meta;
  REF.species = data.species || [];
  REF.forms = data.forms || [];
  REF.types = data.types || [];
  REF.games = data.games || [];
  REF.dexes = data.dexes || [];
  REF.dexMappings = data.dex_mappings || {};
  REF.imageSources = data.image_sources || {};
  REF.berries = data.berries || [];

  REF.species.forEach((s) => idx.speciesByNat.set(s.national_no, s));
  REF.types.forEach((t) => idx.typeByName.set(t.name, t));
  REF.games.forEach((g) => { idx.gameById.set(g.id, g); idx.gameByIdLower.set(String(g.id).toLowerCase(), g); });
  REF.dexes.forEach((d) => idx.dexById.set(d.id, d));
  REF.berries.forEach((b) => idx.berryById.set(b.id, b));
  return REF;
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
