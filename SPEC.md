# DexTracker — Functional Specification

> Purpose: This document specifies **what** DexTracker does, derived from the existing
> `DexTrackerV2.xlsx` workbook. It is intentionally implementation-agnostic — it describes
> data, rules, and behavior, not code, storage engines, or UI frameworks. It is the
> source of truth for rebuilding the spreadsheet as an application.

---

## 1. Overview

DexTracker is a **personal Pokémon collection tracker**. It records which Pokémon a single
owner has caught — across every mainline game and across normal **and** shiny variants —
together with where each one is stored, which game it originated from, and who its Original
Trainer (OT) was. From that raw ownership data it computes living-dex completion for the
National Dex, every regional/per-game dex, alternate forms, and shiny equivalents, and
presents it through a Pokémon HOME–style **box grid**.

Beyond the core tracker the app also keeps three companion records: a **Hall of Fame** of
champion teams per game, a **Switch profile / save manager**, and a **Legends Z-A cooking
recipe planner**.

### 1.1 Primary users and use cases

- Single owner ("living dex" completionist). No multi-user accounts.
- "What do I still need to catch in dex X?" → browse a dex, filter to missing, see the
  next target.
- "Where is Pokémon Y stored?" → look up its box and position.
- "How complete am I?" → completion percentages per dex and per game.
- "Which of my Switch accounts has save Z / raid Z?" → profile lookup.
- Plan an optimal Legends Z-A berry recipe.

### 1.2 Guiding decisions (agreed)

1. **Reference data is app-managed seed data.** The species list, dex→National mappings,
   type data, game/mark metadata, and sprite-image URL templates are authoritative
   reference content the app ships with (and can regenerate from a canonical source). They
   are **not** user data.
2. **All user-created data lives in a single, shareable "savefile."** Everything the owner
   types — ownership/OT/TID for normal and shiny, the OT registry, Hall of Fame teams,
   Switch profiles (including credentials), and saved cooking recipes — is one portable
   document that can be exported, backed up, and shared. See §10.
3. **Primary interface is the HOME-style box grid** (§7).
4. **Normal and shiny are tracked as two independent records per species/form** — each has
   its own OT and TID and is "owned" independently.

---

## 2. Core concepts and terminology

| Term | Meaning |
|------|---------|
| **Species** | A National Dex entry (base species). The workbook tracks **1025** species. |
| **Form** | An alternate form of a species (e.g., Alolan Rattata, Female, Gigantamax). Tracked separately (~400 form entries). |
| **National No.** | The canonical National Pokédex number, zero-padded to 4 digits (e.g., `0001`). The universal key. |
| **Regional / Dex No.** | The number a species has *within a specific game's dex* (differs per game). |
| **OT** | Original Trainer name of a caught Pokémon (free text, e.g., `ASH`, `Tiago`). |
| **TID** | Trainer ID number associated with that catch (string, may be zero-padded, e.g., `01044`). |
| **Owned / "Caught"** | A slot is owned when **both** its OT and TID are filled. Empty OT or TID ⇒ not owned. |
| **Origin** | The game/source a caught Pokémon came from (e.g., `Scarlet`, `Home(SwSh)`, `Event`), derived from its OT+TID via the OT registry. |
| **Mark / Origin Mark** | The little game-of-origin badge (e.g., Paldea symbol, Galar symbol) shown on a Pokémon. |
| **isMine** | Whether a caught Pokémon was personally obtained by the owner vs. received/traded from someone else. |
| **isGo** | Whether a caught Pokémon originated from Pokémon GO. |
| **Box** | A storage box holding **30** Pokémon, laid out as a **6-wide × 5-tall** grid, mirroring Pokémon HOME / the games' PC. |
| **Box Position** | Slot 1–30 within a box. |
| **Box Location** | Which box (`Box 1`, `Box 2`, …, or a grouped label like `Forms - Box 1`). |

### 2.1 The fundamental ownership rule

For any tracked slot (a species' normal slot, its shiny slot, a form's normal/shiny slot,
or a per-game dex entry):

```
owned  ⇔  OT is non-empty  AND  TID is non-empty
```

All completion counts, "missing" lists, and box highlighting derive from this rule.

### 2.2 Box placement math

Given a 1-based sequence number `n` (usually the National No., but for some dexes the
regional No. or a per-group row index):

```
Box number   = floor((n - 1) / 30) + 1
Box position = ((n - 1) mod 30) + 1
```

Forms use **box groups** (see §4) so their box label is `"<Group> - Box <k>"`.

---

## 3. Reference data (app-managed seed; not user-editable)

These define the universe of Pokémon and the assets used to render them. They should be
shipped with the app and regenerable from a canonical dataset.

### 3.1 Species master list
The 1025 National Dex species, each with: Generation, National No. (4-digit), Species name,
a source link (Serebii page), primary Type, optional secondary Type.

### 3.2 Form master list
~400 alternate-form entries, each with: Generation, base National No., Form name (e.g.
`Alolan`, `Galarian`, `Mega`, `Gigantamax`, `Female`), a **Form Code** suffix used to build
sprite URLs (e.g. `-a` for Alolan), an optional "special" form-code variant for art assets,
species link, and a **Box Group** classification (see §4.1).

### 3.3 Types
The 18 elemental types plus `Stellar`, each with a normal type-icon image and a Tera-type
icon image.

### 3.4 Games / sources ("Game Ref")
A catalog of every game/source a Pokémon can originate from — e.g. `Scarlet`, `Violet`,
`Sword`, `Shield`, `Brilliant Diamond`, `Legends: Arceus`, `Let's Go Eevee`, `Sun`,
`Ultra Sun`, `Y`, `White`/`White 2`, `Heart Gold`/`Soul Silver`, `Platinum`, `Emerald`,
`Silver`, `Yellow`, `Go`, `Home`, `Bank`, `Event`, `Legends: ZA`, plus "transfer" pseudo-
sources like `Home(SwSh)`, `Home(SV)`, `Event(SwSh)`. Each game has:
- a game icon image,
- an origin-**mark** image (the badge stamped on the Pokémon),
- a short **Mark Code** (e.g. `SV`, `SWSH`, `BDSP`, `LA`, `LGPE`, `LZA`, `USUM`, `SM`,
  `ORAS`, `XY`, `B2W2`, `BW`, `HGSS`, `DPPt`, `RSE`, `GS`, `RBY`, `HOME`, `BANK`, `Go`).

### 3.5 Sprite images — sources and composition rule
Sprite image URLs are **never stored per Pokémon**; they are composed on demand from a small
set of **image sources** plus the Pokémon's number. Only the Serebii *page* link is stored
directly per species/form (it is not composable).

**Image sources.** Each source is a `{prefix, suffix}` pair per variant:
- `home` — the National/HOME sprites: `normal`, `shiny`, `art` (Sugimori), `icon` (SV menu).
- Per-game sources keyed by a code — `LGPE`, `SWSH`, `BDSP`, `LA` (PLA), `SV`, `LZA` (PLZA) —
  each with `normal` and `shiny` only. (Some reuse another game's host, e.g. BDSP uses the
  SwSh sprites and PLZA uses the Legends sprites; this is intentional.)

**Composition rule.** For any variant:

```
url = prefix + pad3(national_no) + form_code + suffix
```

- `pad3` zero-pads the **National No.** to a **minimum of 3 digits** (`001`, `122`, `1000`) —
  note this differs from the 4-digit `national_no` key used elsewhere.
- `form_code` is appended for National **Form** Dex entries only (e.g. `-a` for Alolan); it is
  empty (`""`) for base species and for every per-game dex entry.
- The `art` variant uses the form's **special** form code instead of `form_code` (they differ
  for a few forms).

**Which source a dex uses.** Each dex declares its `sprite_source` (one of the codes above).
National/Form/Shiny/FRLG dexes use `home`; per-game dexes use their game code. A regional-dex
entry's sprite is therefore composed from its dex's source + the entry's National No. (no
per-row URL needed).

> Implementation note: the workbook generated these URLs with `IMAGE()` formulas and hardcoded
> serebii.net / bulbagarden hosts; it also carried a half-migrated "Flat Ref Data" sheet
> consolidating reference data into one typed table (groups `LINK`, `GAME_REF`, `REG_DEX`,
> `TYPE_IMG`, `FORM`, plus `*_OLD` legacy copies). The app should keep a single source-and-rule
> model (as in `reference_data.json → image_sources`) and drop the legacy copies. Because the
> rule is a simple `number + code` pattern, any form whose real sprite path deviates will 404 —
> the same limitation the spreadsheet had.

### 3.6 Dex registry
The list of all dexes the app knows about, each with: an ID, a display name, whether it has
its own regional numbering (`Has Dex No.`), and an associated game Mark Code. Dexes:

| Dex | Has regional No. | Mark |
|-----|------------------|------|
| Nat Dex (Home) | yes | — |
| Shiny Nat Dex (Home Shiny) | yes | — |
| LGPE Dex | yes | LGPE |
| SwSh Dex / SwSh-IoA / SwSh-TCT | yes | SWSH |
| SwSh-Not In | no | SWSH |
| BDSP Dex | yes | BDSP |
| PLA Dex | yes | LA |
| SV Dex / SV-TTM / SV-TID | yes | SV |
| SV-Not In | no | SV |
| PLZA Dex / PLZA-MD Dex | yes | LZA |
| FRLG Dex | yes | — |
| Nat Form Dex / Shiny Nat Form Dex | no | — |

("IoA" = Isle of Armor, "TCT" = Crown Tundra, "TTM" = Teal Mask, "TID" = Indigo Disk,
"MD" = a Z-A secondary dex, "Not In" = catchable but absent from that game's dex.)

---

## 4. Domain model — what the app stores and computes

This section describes the logical entities. Which fields are **user-entered** (savefile)
vs **derived/seed** is marked. Derived fields are recomputed by the app, never stored as
truth.

### 4.1 Pokémon entry (National Dex)
One per species (1025). Fields:

- **Identity (seed):** Generation, National No., Species, type 1, type 2, and the Serebii
  page link. Sprite images (icon, art, normal, shiny) are **composed**, not stored — see §3.5.
- **Placement (derived):** Box Location and Box Position from the National No. (§2.2).
- **Normal ownership (user):** OT, TID.
- **Shiny ownership (user):** OT-Shiny, TID-Shiny.
- **Derived per slot (normal and shiny each):**
  - `owned` (National / Shiny Dex flag) — both OT & TID present.
  - `Origin`, `Origin Icon`, `Origin Mark`, `Origin Mark Code` — resolved from OT+TID via
    the OT registry (§4.4) and Game Ref (§3.4).
  - `isMine`, `isGo` — from the OT registry.
- **Per-game availability (derived from per-game dexes, §4.3):** for each of LGPE, SwSh,
  BDSP, PLA, SV — whether the species appears in that game and whether it is **transferable**
  into that game. Transfer rules are game-specific; e.g. BDSP transferable when the species'
  generation is 1–4; SwSh/SV/PLA/LGPE transferable when the species exists in that game's
  (or its DLC's) dex.

### 4.2 Form entry (National - Form Dex)
One per alternate form (~400). Same shape as a species entry, plus:
- **Form, Form Code** (seed) — used to select the right sprite.
- **Box Group (seed):** one of `Forms` (default / "Misc."), `Female`, `Gigantamax`. Forms
  are binned into boxes **within their group**, so box labels read `Forms - Box 3`,
  `Female - Box 1`, etc.
- Normal & shiny ownership (user) and the same derived fields as §4.1.

### 4.3 Per-game dex entry
Each game/dex (LGPE, SwSh + IoA/TCT/Not-In, BDSP, PLA, SV + TTM/TID/Not-In, PLZA + MD, FRLG)
has its own ordered list mapping that game's **regional dex number** → **National No.**.
Each entry has:
- **Seed:** regional Dex No., National No., Species (looked up from the species master),
  game-specific normal & shiny sprites.
- **User:** OT, TID, isMine for *that game's* copy of the Pokémon.

> Note: ownership is recorded both at the National-Dex level (the "Home" living dex) **and**
> per game. The per-game OT/TID let the owner track, e.g., a separate caught copy living in
> SV vs. the one deposited in HOME. The spec preserves this: a per-game dex tracks catches
> *in that game*, independent of the master living dex.

### 4.4 OT registry (Trainer registry)
A user-maintained lookup keyed by **(OT, TID)**. Every distinct trainer/source the owner has
encountered appears once. Fields (user-entered): OT, TID, isMine (bool), isGo (bool),
Profile (a Switch profile name or `N/A`), Game (origin game — must match a Game Ref id),
Description (free text, e.g. `Shiny Jirachi`, `N's Pokemon`). The registry's **icon** is
derived from the Game.

This registry is the join table that turns a bare OT+TID on any Pokémon into rich metadata
(origin game, mark, isMine, isGo). It must stay consistent: a Pokémon whose OT+TID is not in
the registry shows `N/A` origin.

### 4.5 Hall of Fame entry
A flat list of champion-team members, grouped by Game. Each row (user-entered): Game,
National No., Name, Species, Nickname (optional), OT, TID; plus derived game icon, sprites,
origin/mark, isMine, isGo. Represents the team the owner beat each game with.

### 4.6 Switch profile entry
Rows describing the owner's Switch save setup. Fields (user-entered): Profile name, Game,
account Email, Password, Info/notes (e.g. "Shiny Gimmighoul Raid + Shiny Outbreaks: …").
Used to remember which account/save holds which event, raid, or outbreak.

> **Security requirement:** This data includes account emails and passwords. Because it is
> part of the shared savefile (§10), the spec requires credentials be handled as secrets —
> never displayed in plaintext by default, masked in the UI, and (if the savefile is shared)
> excludable or encrypted. See §10.2.

### 4.7 Cooking recipe data (Legends Z-A)
Two parts:
- **Berry reference (seed):** each berry with its flavor profile — Sweet, Spicy, Sour,
  Bitter, Fresh — plus Level and Calories contributions, and a sprite. Includes "hyper"
  berry tiers used in high-level recipes.
- **Saved recipes (user):** named recipes (e.g. `Hunter`, `Hunt & Hunt`), each a list of up
  to 8 berry slots, with the resulting aggregated flavor totals (Sweet/Spicy/Sour/Bitter/
  Fresh/Level/Calories), a Flavour Score, Stars, and an estimated cook Time. See §9.

---

## 5. Derived/computed logic (rules, not formulas)

The app recomputes all of the following from user data + seed data:

1. **Ownership flags** — §2.1 for every normal/shiny slot.
2. **Origin resolution** — match a slot's (OT, TID) against the OT registry to get Origin
   game, then Game Ref to get icon, mark, and mark code; `N/A` if unmatched.
3. **isMine / isGo** — read from the matched registry row. Special case: a slot may count as
   "mine" if the registry says so *or* if it has no separate per-row override (the workbook
   treats a blank as "mine" in box views).
4. **Box location & position** — §2.2; forms use box groups (§4.2).
5. **Per-game availability & transferability** — §4.1 / §4.3.
6. **Sprite URL composition** — §3.5.
7. **Species name** — for per-game and helper lists, looked up from the species master by
   National No.
8. **Completion statistics** — §6.

---

## 6. Statistics / completion dashboard

A dashboard summarizing collection progress. For each metric: a **count**, a **percentage**
of the relevant total, and a separate **"Go" count/percentage** (how much of the progress
came from Pokémon GO). Metrics:

- **National Dex:** size (1025), owned, missing.
- **Form Dex:** size, owned, missing.
- **Shiny National Dex:** owned, missing.
- **Shiny Form Dex:** owned, missing.
- **Per game/source:** for every Game Ref source (Home/Go, Scarlet, Violet, Legends: ZA,
  Legends: Arceus, BDSP, SwSh, LGPE, USUM, …, down to Yellow): how many owned Pokémon have
  that origin, the % of the National Dex it represents, and the same for shinies. Each row
  shows the game icon and a "relevance"/ordering rank.

Percentages are owned ÷ total, rounded for display.

---

## 7. Primary interface — the Box View (HOME-style grid)

The main screen renders **one box at a time** as a 6×5 grid of Pokémon, exactly like the
Pokémon HOME / in-game PC. Two box views exist: one for the **species/regional** dexes
("Regional Dex Box") and one for the **forms** dexes ("National Form Dex Box"). They behave
identically except the form view bins by box group and uses form sprites.

### 7.1 Controls (dashboard)

- **Dex Of** — pick which dex to display (dropdown of all dex names from §3.6: Home,
  Home Shiny, LGPE, SwSh, SwSh-IoA, …, PLZA, FRLG, Nat/Shiny Form Dex). Drives which dataset
  and numbering the grid uses.
- **Only Present** (toggle) — when on, hide un-owned slots (show only caught Pokémon); when
  off, show the full dex with missing slots blanked/greyed.
- **Mode** — `Regional` vs `National` numbering: whether the grid is ordered/numbered by the
  selected dex's regional number or by National No.
- **Search By No.** — jump to a Pokémon by number.
- **Search By Species** — jump to a Pokémon by name.
- **Main Img Src** — choose which sprite set to render (main vs alternate source).
- **Pagination** — boxes are pages: `Page X of Y`, with previous/next, and an
  **Active/Inactive** indicator for whether the current page maps to a populated box.

### 7.2 Grid cell

Each of the 30 cells shows the Pokémon's sprite/icon and conveys: whether it's owned
(highlight vs greyed/empty), its number and species (on hover/label), and its origin mark
badge. Cells map to box positions 1–30.

### 7.3 Selected-Pokémon detail panel

Selecting a cell (or the current search target) surfaces details: National No., Regional No.,
Species, sprite (normal/shiny per current view), OT, TID, Origin (game), Origin Icon, Origin
Mark, plus Is Go / Is Mine / Is Dex flags, and computed Box Location / Box Position.

### 7.4 "Next to catch"

The view computes and highlights the **next missing Pokémon** in the selected dex (lowest
number not yet owned), shows its sprite/name, and a count of **how many are left** to
complete that dex. The underlying selection logic: among the dex's entries, pick those that
are not owned (or, for "show all", not yet caught / not filtered out) and take the first.

### 7.5 Editing

The box view (or a per-dex table behind it) is where the owner **records catches**: set
OT/TID (and shiny OT/TID) for a slot, which immediately recomputes ownership, origin, marks,
stats, and "next to catch." Adding a new (OT, TID) the app hasn't seen should prompt to
create/confirm an OT-registry entry (§4.4) so origin resolves.

---

## 8. Secondary views

- **Per-dex tables** — the flat list behind each dex (regional No., National No., species,
  sprites, OT/TID/isMine). Useful for bulk editing.
- **Hall of Fame** — champion teams grouped by game (§4.5), shown as themed team rosters.
- **Switch Profiles** — the save/account manager table (§4.6), with credentials masked.
- **Stats** — the completion dashboard (§6).

---

## 9. Cooking recipe planner (Legends Z-A)

A standalone utility for planning Z-A cooking.

- **Berry pantry (seed, §4.7):** browse berries and their flavor/level/calorie values.
- **Recipe builder:** assemble up to 8 berry slots; the tool aggregates the five flavors
  plus Level and Calories, derives a **Flavour Score**, **Stars**, and an estimated **Time**.
- **Saved recipes:** keep named recipes with notes (e.g. "For pkmn zones + farm") in the
  savefile.
- **Optimizer (intended):** given a target flavor/level outcome, suggest berry combinations
  that maximize the Flavour Score / Stars. (The workbook contains worked recipes; an explicit
  optimizer is a natural extension — see Open Questions.)

---

## 10. The savefile (portable user data)

### 10.1 Contents
A single document containing **everything the user creates**, independent of seed/reference
data:

- Per-species normal & shiny OT/TID (the master living dex).
- Per-form normal & shiny OT/TID.
- Per-game dex OT/TID/isMine.
- The OT registry (§4.4).
- Hall of Fame teams (§4.5).
- Switch profiles incl. credentials (§4.6).
- Saved cooking recipes (§4.7).
- (Optionally) UI state such as last-selected dex / box.

### 10.2 Behavior
- **Export / import / share** as one file; **backup**-friendly.
- Must remain valid as seed/reference data is updated (new generations, new games): the
  savefile keys on stable identifiers (National No., OT+TID, dex id, berry id), not on row
  positions.
- **Credentials handling:** Switch-profile passwords are secrets. Default: masked in UI and
  either excluded or encrypted when the savefile is exported for sharing. Sharing a savefile
  should never silently leak plaintext passwords.

---

## 11. Non-functional notes

- **Single user**, local-first; no accounts/auth beyond protecting the savefile.
- **Offline-capable** for owned/derived data; sprite images are fetched from external URLs
  (seed templates) and should be cached/lazy-loaded.
- **Scale:** ~1025 species + ~400 forms + ~2000 per-game dex rows + a few hundred registry/
  HoF/profile/recipe rows. Small; full recompute on edit is acceptable.
- **Data integrity:** ownership, stats, origin, and box placement must always be consistent
  with the rule in §2.1 and the OT registry; they are derived, never hand-edited.

---

## 12. Open questions & decisions

Resolved (this revision):
- ✅ Scope includes core tracker, Hall of Fame, Switch profiles, and the cooking planner.
- ✅ Reference data is app-managed seed data, not user data.
- ✅ Primary UX is the HOME-style box grid.
- ✅ Normal and shiny are separate records per species/form.
- ✅ All user data is one shareable savefile; credentials handled as secrets.

Still open:
1. **Per-game vs master ownership** — should the app keep ownership *both* at the master
   living-dex level and per-game (as the workbook does), or treat per-game presence as
   purely derived from one canonical "where is it stored" record? (Spec currently preserves
   both.)
2. **Cooking optimizer depth** — is an automatic recipe optimizer in scope, or only a
   manual builder + saved recipes? Need the exact Flavour Score / Stars / Time formulas if
   the optimizer is wanted (they are values-only in the workbook).
3. **Transfer-rule completeness** — confirm the exact per-game transferability rules for
   each game/DLC (the workbook encodes several heuristics, e.g. BDSP = Gen 1–4).
4. **Form box-group taxonomy** — are `Forms` / `Female` / `Gigantamax` the only box groups,
   or should Mega / regional variants get their own groups?
5. **Sprite sourcing** — keep external serebii/bulbagarden URLs, or bundle a local sprite
   pack for offline use? (Affects §3.5 / §11.)
6. **"isMine when blank = mine" heuristic** — confirm the intended default for catches whose
   registry row doesn't explicitly set isMine.

---

## Appendix A — Source workbook map

The originating workbook `DexTrackerV2.xlsx` (Google Sheets export) sheets and their role:

| Sheet | Role in this spec |
|-------|-------------------|
| `National Dex` | §4.1 species entries (master living dex) |
| `National - Form Dex` | §4.2 form entries |
| `Regional Dex Box`, `National Form Dex Box` | §7 box views (visible UI) |
| `LGPE/SwSh/SwSh-IoA/SwSh-TCT/SwSh-Not In/BDSP/PLA/SV/SV-TTM/SV-TID/SV-Not In/PLZA/PLZA-MD/FRLG Dex` | §4.3 per-game dexes |
| `Nat Dex`, `Nat Form Dex`, `Shiny Nat Dex`, `Shiny Nat Form Dex` | flattened helper projections feeding the box views |
| `OT + ID No. Ref Data` | §4.4 OT registry |
| `Ref Data`, `Flat Ref Data`, `Game Ref Data`, `Type Ref Data`, `Link Ref Data`, `Reg Dex Ref Data`, `Box Setup Ref Data` | §3 seed/reference data |
| `Stats` | §6 dashboard |
| `Hall Of Fame` | §4.5 |
| `Switch Profile MetaData` | §4.6 |
| `PLZA Cooking Mamas Pantry` (berry table), `PLZA Cooking Mamas Kitchen` (recipes) | §9 / §4.7 |

> The workbook is a Google Sheets app built on `QUERY`, `IMAGE`, `ARRAYFORMULA`, and
> `VLOOKUP`/`INDEX-MATCH`. Those mechanisms are **implementation detail** and deliberately
> excluded here; only the resulting behavior is specified.
