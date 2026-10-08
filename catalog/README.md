# Gear catalogue

Data files: `fixtures/<brand>.json` (array of `Fixture`), `modifiers/modifiers.json` (array of
`Modifier`) and `stands/<brand>.json` (array of `Stand`). Review sheets: `fixtures.csv`,
`modifiers.csv`, `stands.csv` (regenerate with `npm run catalog:csv`). Types: `src/catalog/schema.ts`. Rules: `src/catalog/classify.ts`.

Rule for every record: **unknown = `null`, never guessed.** Each record lists its `sources`.

## Fixture fields
| Field | Meaning |
|---|---|
| `model`, `aliases` | Fixture name, plus names crews use |
| `powerW` | Max power draw |
| `weightKg` | **Main fixture (head) weight only**, the key number |
| `psu.external`, `psu.weightKg`, `psu.ipRating` | External power supply / control box, its weight and IP rating |
| `sizeCm` | Size when deployed (l × w × h) |
| `headCableM` | Cable length, power supply → fixture |
| `ipRating` | Fixture IP rating (weather sealing) |
| `batteries` | Battery types it runs on and **max output % on each**. `[]` = mains only, `null` = not stated |
| `mount` | Accessory mount (bowens, mini-prolock, aputure-mount, godox-mount, g-mount, nl, fm, fe, be); `null` = not stated |

## Modifier fields
`type`, `weightKg`, `sizeCm`, `mounts` (fits any light with that mount) and `fitsFixtureIds`
(fits only those models). A light's **rig weight** = head weight + attached modifiers.

## Stand fields
`type` (light, c-stand, combo, roller, boom), `weightKg`, `loadCapacityKg`, `minHeightCm` (closed),
`maxHeightCm` (fully extended). When a vendor page gives imperial and metric values that disagree, the
imperial value is used and the record gets a note.

## Derived (computed, not stored)
- **Size class**:
  - tiny: < 40 W, or < 150 W and < 600 g
  - small: 40–150 W, or < 600 W and < 1 kg
  - medium: 150–600 W
  - large: 600–2500 W
  - huge: ≥ 2500 W
- **Best for rigging**: 3 fixtures per size class. Mat and inflatable lights come first, then the lightest by head weight.
- **Weather sealed**: IP rating with water digit ≥ 4 (IPx4, IP54, IP65…). Fixture and power supply are checked separately.

## Sources to extract
| Brand | Source |
|---|---|
| Aputure | https://aputure.com/en-US/collections/all-lights |
| amaran | https://amarancreators.com/collections/all |
| Godox | https://www.godox.com/Downloads/Godox_Continuous_Lighting_Catalogue_EN.pdf |
| Godox KNOWLED | https://www.godox.com/Downloads/Godox_KNOWLED_Lighting_Catalogue_EN.pdf |
| Nanlux | https://cdn-aliyun.nanlux.com/release/1788754151513-770031-113388364096412-20260807_NANLUX%E4%BA%A7%E5%93%81%E5%86%8C%EF%BC%88202608-1%EF%BC%89_A4_%E8%8B%B1%E6%96%87-%E3%80%90%E4%B8%8D%E5%8F%AF%E7%BC%96%E8%BE%91RGB%E3%80%91%E9%98%85%E8%AF%BB%E7%89%88-%E5%8E%8B%E7%BC%A9.pdf |
| Nanlux (web) | https://www.nanlux.com/product?model=evoke#/en |
| Nanlite | https://cdn-aliyun.nanlite.com/release/1784539206097-287704-112412124152153530517-202605_NANLITE%E4%BA%A7%E5%93%81%E5%86%8C_A4_%E8%8B%B1%E6%96%87%E9%98%85%E8%AF%BB%E7%89%88_%E4%B8%8D%E5%8F%AF%E7%BC%96%E8%BE%91RGB_%E5%B7%B2%E5%8E%8B%E7%BC%A9.pdf |
| Nanlite (web) | https://www.nanlite.com/product?model=fs#/en |

Modifiers also come from the brands' accessory pages (aputure.com, amarancreators.com) and the
catalogues above. Nanlite's own accessory pages could not be reached; its modifiers come from the catalogue only.

| Stands | Source |
|---|---|
| Godox | Godox Continuous Lighting Catalogue (above) |
| Aputure / amaran | https://amarancreators.com (product pages) |
| Matthews | https://www.msegrip.com |
| Kupo | https://kupogrip.com |
| Manfrotto | https://www.manfrotto.com |
| Avenger | Not included: avenger-grip.com no longer serves product pages. |
