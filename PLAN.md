# Lighting Floor Plan Designer — Product & Technical Plan

A simple, touch-friendly app for cinematographers and gaffers to draw top-down lighting
plans at real-world scale, track the gear they need, and hand a clean package to
producers and rental houses.

---

## 1. Core concepts

### Scale
- World units are **centimetres**. Everything (lights, frames, tables, cars) is stored and
  drawn at its real footprint.
- Default canvas: grey background, **50 cm grid**. Thicker lines every 1 m and 5 m; the grid
  adapts as you zoom out so it never turns into noise.
- **Metric by default**. Switch to imperial in settings: the grid becomes 2 ft and every input
  and export uses ft/in. The setting is per user and can be overridden per project.
- Two icon display modes:
  - **True scale**: a 12×12 butterfly really is 3.66 m wide.
  - **Symbol**: keeps small items legible when zoomed out.

### Project structure

```
Project (production)
 └─ Location            address, sun data, background photo, set layout, scout photos
     └─ Scene
         └─ Shot / Setup   lights, cameras, actors, grip for this setup
```

- **Set layer** (one per location): walls, doors, windows, furniture, props and the background
  photo. It is shared by every shot, so moving the sofa once updates every setup.
- **Setup layer** (one per shot): lights, flags, frames, cameras, camera moves and actor
  blocking. "Duplicate shot" makes it fast to iterate from setup to setup.
- This matches the reference screenshot: a Scene 1 / Shot 3 navigator with a Shots dropdown.

---

## 2. Features

### 2.1 Canvas & editing
- Pan with the middle mouse button or Space + drag (left-drag never pans, so it can't move the
  view by accident); zoom with the wheel. Tablets: two-finger drag and pinch.
- Tap a library item to place it. You can then drag, rotate (handle or two-finger twist),
  resize where it makes sense, duplicate, delete, lock and hide it.
- Box select, multi-select, align and distribute, copy/paste. No snapping: items are placed
  freely. The grid can be shown or hidden.
- Undo/redo, with on-screen buttons because tablets have no keyboard.
- Labels with leader lines (as in the reference), and free text notes and arrows.
- Layers panel with lock and visibility per layer and per category.
- Design styles: **Dark** (as in the reference), **Light/Print**, and **Blueprint** (B&W,
  photocopy-safe).
- Status bar: live total wattage and amperage (e.g. `5460W | 23.74A`).

### 2.2 Object library
| Category | Examples |
|---|---|
| Lights | Fresnels, open faces, HMI PARs, LED panels, COB + reflector, tubes, bulbs/practicals, mats, spacelights, balloons, ellipsoidals |
| Modifiers | Softbox, lantern, dome, barn doors, snoot, grid/egg-crate |
| Grip | Flags, floppies, nets, silks, frames 4×4 → 20×20 (diffusion, bounce, neg), V-flats, polyboards, mirror boards |
| Camera | Camera (with FOV cone), dolly + track, steadicam path, slider, jib/crane, video village |
| People | Actors (name + colour), stand-ins, crew positions |
| Set | Walls, single and double doors, windows, stairs, columns |
| Props | Tables, chairs, sofa, bed, desk, plants, bushes, trees, lamps, car, TV, shelves, rug |

Practical lamps can count as lights, so they show up in power and DMX totals.

### 2.3 Lights in detail
Each placed light carries:
- **ID**: auto-numbered (`L1`, `L2`…) with an optional role (Key, Fill, Back…).
- **Fixture and mode**: power draw is filled in from the catalogue.
- **Colour**: CCT, gel (`CTS ¼`, `CTB ½`, …) and diffusion (216, 250, grid cloth…).
- **Output**: intensity %.
- **Modifier**: pick the light first, then a modifier from the list of modifiers that fit it
  (made for that model, or matching its mount: Bowens, NL, G-mount, FM…). Several can stack
  (e.g. adapter + Fresnel). The modifier's **weight** is added to the light's to give the
  **rig weight**, which is shown on the light and used for stand and rigging checks.
- **Beam**: beam angle and throw length. These drive the **beam cone** on the plan, a soft
  gradient tinted by CCT or gel.
- **Placement**: height and tilt (for notes and the photometric phase).
- **Control**: circuit or distro, DMX universe and address, free notes.

### 2.4 String lights tool
For a row of identical fixtures. Examples: tubes along a ceiling beam, a line of LED panels
over a set, practicals down a corridor, or a curved row of lights around a car.

How it works:
1. Pick the **String** tool and set the **start** and **end** points (tap–tap or drag). One
   light goes on each end.
2. Choose the **fixture** and the **total count**. The remaining lights are spaced evenly
   between the two ends, and the panel shows the spacing live (e.g. "8 × Titan Tube,
   every 64 cm").
   - Alternative: set a spacing ("every 1 m") and let the count follow.
3. **Curve**: drag the midpoint handle to bend the line. Add more handles for S-curves. Lights
   are spaced evenly along the curve's real length.
4. **Aim mode**:
   - **Same direction**: all lights point parallel. One rotation handle turns them all; the
     default is square to the line.
   - **Same spot**: all lights aim at one target point. Drag the target and every light
     re-aims.
   - **Follow curve** (extra): each light points square to the curve where it sits, facing in
     or out (flip). This suits an arc of lights around a car or set.

Behaviour:
- Endpoints, curve handles, count, fixture and aim all stay editable, and the lights re-space
  live.
- One settings panel (CCT, gel, intensity, modifier) applies to the whole string. You can
  override settings per light, or **Detach** the string into individual lights.
- The equipment list and power totals count it as N fixtures.
- IDs are numbered as a group (`L5.1`–`L5.8`). Optional sequential DMX addressing from a start
  address.
- It snaps to grid and walls like everything else.
- The same tool works for any library item, such as a row of chairs, flags or sandbags.

### 2.5 Camera & blocking
- Camera FOV cone from **sensor + focal length**, using presets for common bodies and lenses.
- Camera moves:
  - Dolly track: a straight or curved line with its real track length.
  - Steadicam / gimbal path: a free spline.
  - Crane: an arc.
- Actor blocking: mark A → mark B with a dashed path, as in the reference.

### 2.6 Photo backgrounds & calibration (ruler tool)
1. Upload a photo: a ceiling shot looking down, a drone shot, or a scanned plan.
2. **2-point calibration**: tap the start and end of a known object, then type its real
   length (e.g. table = 180 cm). The app computes `cm per pixel` and scales the whole image,
   so the room or street is at true scale against the grid.
3. Rotate to align a wall with the grid, or north with "up". Set opacity and lock the photo.
4. Optional **4-point perspective fix**: tap the 4 corners of a known rectangle (table, car
   roof, rug) and enter width × height. One step corrects both scale and the tilt of a
   not-quite-overhead drone or phone shot.

Extras:
- A **magnifier loupe** while placing points, so your finger doesn't hide the target on a tablet.
- A **measure tool** for the distance between any two points (light → actor, camera → wall).
- A **wall tool**: trace walls over the photo, then drop doors and windows onto them.

Wide-angle lens distortion is not corrected. The app will advise shooting from as high as
possible with a normal lens.

### 2.7 Location, sun path & maps
- Maps provider: **Google Maps** for address search and satellite imagery.
  - Google's terms generally don't allow storing its imagery on our servers. The app saves
    the location and zoom and re-loads the imagery when you open the plan. Satellite
    backgrounds therefore need a connection; your own photos still work offline.
  - Exports carry Google's attribution. Check the print/PDF rules in the terms before launch.
  - The provider sits behind an interface, so switching to Mapbox or Esri is a small change
    if terms or cost become a problem.
- Enter an address. It is geocoded to lat/lng, and the timezone comes from the coordinates.
- **Satellite import with auto-scale**: fetch the overhead map for the address. Map imagery
  has a known metres-per-pixel at each zoom, so no ruler is needed and north is already up.
- **North alignment** for photo backgrounds: rotate a compass widget once per location.
- **Sun overlay**:
  - The day's sun arc and a sun-direction arrow on the plan.
  - A date picker and time slider that animate the sun.
  - Sunrise, sunset, solar noon, golden hour, blue hour and sun elevation, all in the
    location's local time.
  - Shadow ratio: "a 1 m object casts a 2.3 m shadow now".
- Later: **sunlight through windows**. Combining the sun direction and elevation with window
  sill and head heights gives the sun patch on the floor at a given time.

### 2.8 Equipment list (automatic)
- Every placed catalogue item feeds a live equipment list, grouped by department: Lighting,
  Grip, Electric, Camera support and Art/Props. Props are excluded from rental exports by
  default.
- **Reuse-aware quantities**: gear is reused between shots, so the default quantity is the
  **maximum used at once** across the selected shots, not the sum. A per-shoot-day breakdown
  is optional.
- Lines can be edited by hand: change a quantity, add a note, or mark it **owned** so it
  drops off the rental list.
- Each line shows where it came from: `auto` (from the plan), `kit`, `rule` or `manual`.

### 2.9 Kits & accessory rules
**Kits** (your "add to equipment list" presets) are named, reusable lists with quantities,
added with one button. For example:

| Kit | Contents (example) |
|---|---|
| Small production | 10 sandbags, 6 × 10 m stingers, 2 power strips, 1 apple box set, 4 C-stands, gaffer tape ×4 |
| Medium production | 30 sandbags, 15 stingers, 2 × 32 A distro, 2 apple box sets, 12 C-stands, … |
| Large production | … |

- Kits sync to your account, so they are available in every project.
- **Accessory rules** (optional add-on) scale with the plan:
  - Each light on a stand adds 1 stand + 2 sandbags + 1 stinger.
  - Each HMI adds a head cable and a ballast.
  - Each frame of 8×8 or larger adds 2 high rollers + 4 sandbags.

### 2.10 Power
- **230 V by default**. Switch to 120 V or enter any value (e.g. 100 V Japan, 240 V UK/AU).
  The setting is per user and can be overridden per project, for example when shooting abroad.
  Breaker presets follow the chosen region.
- Total watts and amps at the chosen voltage.
- Assign lights to circuits or distros, with a warning when a circuit exceeds its breaker
  (16 A, 20 A, 32 A…).
- Generator sizing suggestion: total load plus about 25 % headroom.

### 2.11 Attachments
Scout photos, mood references and documents can be attached to a location, scene or shot.
Each attachment can have a caption and an optional pin on the plan showing where it was taken
and in which direction.

### 2.12 Export
- **PNG**: the current view or fit-to-content, at a chosen resolution, with or without the
  background photo.
- **Multi-page PDF**, built from the pages you tick:
  1. Cover: production, location, shoot date, DP and gaffer, sun times.
  2. Location overview: the set layer and photo.
  3. One page per shot: the plan, a legend, and a **lighting schedule** table (ID, fixture,
     modifier, gel/CCT, %, circuit, DMX).
  4. Equipment list by department.
  5. Power summary.
  6. Reference photos with captions.
  7. Notes.
- Paper sizes A4, A3, Letter and Tabloid, with **true-scale printing** (1:50, 1:100) so a
  plan can be measured with a ruler.
- Equipment list also exports as **XLSX / CSV** for rental houses.

### 2.13 Sync via Google Drive, offline, sharing
- Sign in with Google once to see the same projects on phone, tablet and PC.
- Projects are saved to the user's **own Google Drive** in a `Lighting Plans/` folder: one
  data file per project, with its photos in a subfolder. Kits and settings are saved there too.
- The app asks for permission to see **only the files it creates**, never the rest of the
  Drive. This is also the easiest permission to get approved by Google.
- **Offline-first**: every change is saved on the device first, then uploaded a few seconds
  after you stop editing, or once you're back online. On open, the app pulls newer versions
  from Drive.
- If the same project was edited on two devices while offline, the app detects it (using
  Drive's version numbers) and you choose which version to keep, or keep both.
- Version history comes from Drive's file revisions.
- **Sharing** with producers and rental houses uses normal Drive sharing of the project
  file or the exported PDF.
- Storage sits behind an interface (local ↔ Google Drive), so our own cloud can be added
  later if team editing or non-Google users are needed.

### 2.14 Templates
Start a plan from a ready-made setup, then adjust it.
- Examples: **Interview**, **Teleprompter** (doc), **Green screen** (more to be defined).
- Each template has its own options. For example, Interview asks for the number of
  interviewees and the number of cameras.
- Options can repeat per element. "Number of cameras" can give each camera its own settings.
- A template can create several shots/setups at once (e.g. one per camera angle) plus shared
  set items.
- It is placed where you tap (or at the centre of the view), and everything it creates is a
  normal, editable item.
- Code lives in `src/templates/`; each template is one file that defines its options and a
  `build()` function.

### 2.15 Phone & tablet UX
- An installable app (PWA) on iPad, Android and desktop.
- Large touch targets, long-press context menu, Apple Pencil precision, and on-screen
  undo/redo.
- On phones, the library and property panel open as bottom sheets. Phones are aimed at quick
  edits and viewing; full editing is on tablet and desktop.
- Keyboard shortcuts on desktop (as in the reference's status hints).

---

### 2.16 Edit categories, tools, cast and job gear
- **Top menu categories**: LIGHTS, GRIP (flags, frames, stands, sandbags), CAMERA (cameras,
  dolly, video village) and SCENE (people, set pieces, props). Only items of the active
  category can be selected and moved; everything else is locked and dimmed. Keys 1–4.
- **Tools**: `W` select and move, `R` select and drag to rotate (5° steps, Shift = 45°).
- **Production type** (picked first in Templates): **Narrative** — people are Actors (default);
  **Doc** — people are Interviewees and Interviewers. The role is only a name: every person keeps
  name, colour and gender (male/female icon) across all scenes, and cameras can focus on any.
  The Add section (SCENE) has "+ Actor" or "+ Interviewee / + Interviewer"; a person's role can
  be switched later. The Interview template always places at least one interviewee and one
  interviewer (beside camera A).
- **Camera focus on**: a camera can follow one actor; it turns to face them whenever either moves.
- **Job gear list**: a saved list of fixtures, modifiers and stands with quantities. With
  "Only use this list" on, the library, modifier and stand pickers only offer that gear, and
  show how many are left in the current scene.
- A project holds several scenes (tabs under the top bar; tap the active one to rename,
  duplicate or delete it).

### 2.17 Screen layout
- **Top bar**: "Project › Scene" menu · category LIGHTS / GRIP / CAMERA / SCENE · tool Move (W) /
  Rotate (R) · undo/redo · Templates, Gear list, Export.
- **Project › Scene menu**: scenes (switch, add, rename, duplicate, clear, delete), project name
  and Narrative/Doc, new/delete project, open another project.
- **Side panel always matches the category**: "In this scene" list (tap to select) and the ways
  to add that kind of item. SCENE also holds the cast (people) list. Selecting an item swaps the
  panel to its settings, with "‹ Category" to go back. Settings follow one order for every
  item: name → what it is (fixture/modifiers/stand, fabric, focus, person) → position → actions.
- **Templates and Gear list** open as dialogs (project setup, not per category). A new project
  opens Templates first.
- **View controls** (zoom, fit, show/hide grid) float bottom-right on the plan; the tool badge sits top-left.
- **Phones**: three short top rows; the side panel becomes a bottom sheet whose header is always
  visible.

## 3. Gear catalogue & illustrations

### Catalogue data
Each catalogue entry stores:
- `brand`, `model`, `aliases` (the names crews use: "S60", "M18", "Joker 800")
- `category`, `department`, `family` (which icon it uses)
- `footprintCm` (w × d, so it draws at true scale)
- `powerW`, `source` (LED / HMI / tungsten / fluorescent), `cctRange`, `rgb`, `beamAngle`
- `weightKg` (head only), external power supply and its weight, deployed size, head cable
  length, IP rating of the light and of the power supply, battery types and max output on each
- `mount` (accessory mount) for matching modifiers

Modifiers are a separate list (`catalog/modifiers/`) with type, weight, size and what they fit.
Stands are a separate list (`catalog/stands/`) with type, weight, load capacity, closed and max height.

Derived tags: size class (tiny → huge), best for rigging (mats and inflatables first, then
lightest), weather sealed (IPx4 and up, light and power supply checked separately).

How the catalogue gets built:
1. You send catalogues (PDFs or links to spec pages), in priority order.
2. I extract them into `catalog/<brand>.json`, validated against a schema.
3. You review them as a spreadsheet.
4. The catalogue ships **inside the app**, so it works offline. Updates arrive as versioned
   data. Your own custom items sync to your account.

Suggested first vendors:
- **Lighting**: ARRI, Aputure/amaran, Nanlux/Nanlite, Creamsource, Kino Flo, Litepanels,
  Astera, Quasar Science, Mole-Richardson, DMG Lumière, Godox KNOWLED, K5600, Cineo,
  Digital Sputnik.
- **Grip**: Matthews, Avenger, Kupo, Modern Studio.
- **Gels / diffusion**: Rosco, LEE (CTO/CTB/CTS fractions, 216/250/251, grid cloths, silks).

### Illustrations
- Top-down, consistent style (like the reference), as **SVG** so they stay crisp at any zoom
  and adapt to the design style.
- **Icon families, not one drawing per SKU**: about 30 light families, 20 grip, 10 camera and
  50 props. Each SKU maps to a family and is drawn at its real footprint with its label.
  Hundreds of fixtures need only about 110 drawings, and a new fixture can be added without
  new art.
- Production path:
  1. MVP: clean SVGs drawn in code. They are consistent, fast and themeable.
  2. Polish: replace families with illustrated versions (commissioned, or AI-assisted then
     vectorised) in the same slots.
- Use product names only. Don't use vendor photos or logos (copyright and trademark).

---

## 4. Tech stack (recommended)

| Concern | Choice | Why |
|---|---|---|
| App | React + TypeScript + Vite, **PWA** | One codebase for phone, tablet and PC. Installable and works offline. Can be wrapped with Capacitor for the App Store later. |
| Canvas | Konva (`react-konva`) | Touch and pinch handling, rotate and resize handles, layers, hit-testing, hi-res image export. |
| State | Zustand + Immer (patch-based undo/redo) | Simple and fast. |
| UI | Tailwind + Radix/shadcn | Accessible, touch-friendly components. |
| Local storage | IndexedDB (Dexie) | Offline-first source of truth on the device. |
| Sync / storage | **Google Drive API** (`drive.file` permission) + Google Sign-In | Projects sync through each user's own Drive, so there is no storage bill for us and users own their data. |
| Backend (launch) | Small serverless functions (e.g. Vercel / Cloudflare) | Only for subscriptions (Stripe webhooks) and licence checks. |
| Sun | `suncalc` + `tz-lookup` | Sun azimuth and elevation, and the local timezone, computed on device (works offline). |
| Maps / geocoding | **Google Maps Platform** (Geocoding, Map Tiles / Static Maps), behind a provider interface | The best-known option. Uses an API key restricted to our domain and per-user quotas to keep costs under control. Can swap to Mapbox or Esri. |
| PDF / XLSX | `pdf-lib` / `exceljs` | Built on the client, so export works offline. |
| Validation | `zod` | Catalogue and saved-file schemas with versioned migrations. |
| Images | Client-side resize/compress (≤4096 px, WebP); WebGL for the perspective warp | Fast uploads, small storage. |
| Tests | Vitest (maths: calibration, sun, power, list aggregation) + Playwright (iPad and phone emulation) | |
| Hosting | Vercel / Cloudflare Pages | |
| Payments (launch) | Stripe | Subscriptions for the public release. |
| Monitoring (launch) | Sentry | Error reports from real devices. |

---

## 5. Data model (sketch)

```ts
type Vec2 = { x: number; y: number };          // cm, world space

interface Project {
  id: string; name: string;
  production: { title; dp?; gaffer?; shootDates?: string[] };
  settings?: { units?: 'metric' | 'imperial'; voltage?: number };   // overrides user defaults (metric, 230)
  locations: Location[]; attachments: Attachment[];
}

interface Location {
  id: string; name: string;
  address?: string; geo?: { lat: number; lng: number; tz: string };
  northDeg: number;                              // plan rotation vs true north
  background?: Background;
  setItems: Item[];                              // shared set layer
  scenes: Scene[]; attachments: Attachment[];
}

interface Background {
  assetId: string; cmPerPx: number; rotationDeg: number; offset: Vec2;
  homography?: number[];                         // 4-point perspective fix
  opacity: number; locked: boolean;
}

interface Scene { id: string; number: string; name: string; shots: Shot[] }
interface Shot {
  id: string; number: string; name: string; shootDate?: string;
  items: Item[]; strings: ItemString[];
}

interface LightProps {
  unitId?: string; cct?: number; gel?: string; diffusion?: string; modifier?: string;
  intensityPct?: number; beamDeg?: number; throwCm?: number; heightCm?: number;
  circuit?: string; dmx?: { universe: number; address: number };
}

interface Item {
  id: string; catalogId?: string;
  kind: 'light' | 'modifier' | 'grip' | 'camera' | 'person' | 'set' | 'prop' | 'path' | 'note';
  pos: Vec2; rotationDeg: number; sizeCm?: { w: number; d: number };
  label?: string; locked?: boolean; hidden?: boolean;
  light?: LightProps;
  camera?: { sensor: string; focalMm: number };
  path?: { points: Vec2[]; style: 'dolly' | 'steadicam' | 'crane' | 'blocking' };
}

// String tool: N identical items spaced evenly along a straight or curved line
interface ItemString {
  id: string; catalogId: string;
  count: number;                                 // includes both endpoints
  spacingCm?: number;                            // if set, count follows spacing
  path: { start: Vec2; end: Vec2; handles: Vec2[] };   // handles = curve control points
  aim: { mode: 'parallel'; angleDeg: number }
     | { mode: 'target'; target: Vec2 }
     | { mode: 'normal'; flip: boolean };
  light?: LightProps;                            // shared settings for the whole string
  overrides?: Record<number, Partial<LightProps>>;     // per-light tweaks, by index
}

interface Kit  { id: string; name: string; lines: KitLine[] }
interface Rule { id: string; when: { family?: string; category?: string }; add: KitLine; per: 'item' }
interface KitLine { catalogId?: string; customName?: string; qty: number; department: string }
```

The equipment list is **derived** from items, strings (each counts as `count` units), kits and
rules, plus your manual overrides. It is never stored as a second copy that could go stale.

---

## 6. Roadmap

Each phase ends with something usable.

| Phase | Scope | Done when |
|---|---|---|
| **0. Foundation** | Repo scaffold, lint, tests, CI, PWA shell, preview deploys | The app loads on iPad, phone and PC from a URL |
| **1. Canvas MVP** | 50 cm grid at real scale; pan and zoom (mouse and touch); place, move, rotate and duplicate; labels; multi-select; snap; undo/redo; starter library of about 30 generic items; template picker; local autosave; PNG export | A 3-point interview can be planned on an iPad and exported |
| **2. Photo & measure** | Upload, 2-point calibration with loupe, rotate/opacity/lock, measure tool, wall/door/window tool, 4-point perspective fix | A ceiling or drone photo comes out at true scale |
| **3. Lights & camera detail** | Beam cones, CCT/gel/modifiers, light IDs, **string lights tool**, camera FOV, dolly/steadicam/crane paths, actor blocking, design styles | The reference screenshot can be recreated, and a curved row of 8 tubes aimed at one spot can be placed in seconds |
| **4. Equipment, kits, power** | Auto list, reuse-aware quantities, kits, accessory rules, owned flag, power and circuits, XLSX/CSV export | A rental-ready list comes out in one click |
| **5. Accounts & sync** | Google Sign-In, project → location → scene → shot, Google Drive sync (offline-first, conflict handling), photos in Drive, version history | Start on phone, finish on PC |
| **6. Location & sun** | Address lookup, satellite import with auto-scale, north alignment, sun arc, time slider, sun times | You can see where the sun is at 3 pm on the shoot day |
| **7. Vendor catalogue** | Ingest your catalogues (first pass done: Aputure, amaran, Godox, Nanlite, Nanlux), modifiers per light with rig weight, icon families, search, filters, favourites, custom items | Real fixtures can be picked by name ("S60", "M18") |
| **8. Full PDF package** | Multi-page PDF, lighting schedule, reference photos, true-scale print | A complete package can go to the producer |
| **9. Public launch** | Landing page, Stripe billing (free and pro tiers), team workspaces and roles, terms, privacy policy and GDPR (data export, account deletion), Sentry, Google Maps cost controls, optional App Store and Play Store builds | Anyone can sign up, pay and use it |
| **Later** | Lux/f-stop estimates from photometrics, sun through windows, DMX patch sheet, rental cost estimate, real-time collaboration, iPad LiDAR room scan (native app) | — |

Catalogue extraction (phase 7 data) can run in parallel from phase 1 as soon as you send
catalogues.

The template engine (options and placement) is already in `src/templates/`; template layouts
get filled in as you define them.

---

## 7. Decisions

| Topic | Decision |
|---|---|
| Maps | Google Maps, behind a provider interface so it can be swapped |
| Units | Metric by default, imperial switch (per user, per project override) |
| Voltage | 230 V by default, 120 V or custom switch (per user, per project override) |
| Icons | Simple coded SVG icons first, to be replaced with better art later |
| Audience | Public product (see Phase 9) |
| Platform | PWA first, optional App Store and Play Store builds later *(proposed, no objection yet)* |
| Sync | Google Drive (user's own Drive); own cloud only if needed later |
| Templates | Engine first; each template's layout defined by you later |

## 8. What I need from you
- Vendor catalogues, in priority order.
- Your real small, medium and large kit lists.
- 2–3 real test photos (ceiling shot, drone shot) with one known measurement each.
- An app name and any branding preferences.
