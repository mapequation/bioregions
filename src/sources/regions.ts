// Preset study areas and human-readable area labels.
import type { AreaFilter, BBox } from './types';

export type RegionGroup = 'Continent' | 'Biogeographic realm' | 'Ocean';

export interface RegionPreset {
  id: string;
  label: string;
  group: RegionGroup;
  /** [west, south, east, north]; west > east crosses the antimeridian. */
  bbox: BBox;
}

/**
 * Preset areas as approximate bounding boxes, meant as quick starting points for a
 * query, not as exact boundaries. Continents follow common conventions, realms the
 * WWF/Olson et al. (2001) terrestrial biogeographic realms, and oceans their rough
 * basins. Boxes inevitably include some neighbouring land or sea; use a country list
 * or a drawn polygon when the edge matters.
 */
export const REGION_PRESETS: RegionPreset[] = [
  { id: 'africa', label: 'Africa', group: 'Continent', bbox: [-26, -35, 52, 38] },
  { id: 'asia', label: 'Asia', group: 'Continent', bbox: [25, -11, 180, 82] },
  { id: 'europe', label: 'Europe', group: 'Continent', bbox: [-25, 34, 60, 72] },
  { id: 'north-america', label: 'North America', group: 'Continent', bbox: [-170, 7, -12, 84] },
  { id: 'south-america', label: 'South America', group: 'Continent', bbox: [-82, -56, -34, 13] },
  {
    id: 'australia-oceania',
    label: 'Australia & Oceania',
    group: 'Continent',
    bbox: [110, -50, -120, 30],
  },
  { id: 'antarctica', label: 'Antarctica', group: 'Continent', bbox: [-180, -90, 180, -60] },

  { id: 'realm-neotropic', label: 'Neotropic', group: 'Biogeographic realm', bbox: [-118, -56, -34, 33] },
  { id: 'realm-nearctic', label: 'Nearctic', group: 'Biogeographic realm', bbox: [-170, 15, -12, 84] },
  { id: 'realm-palearctic', label: 'Palearctic', group: 'Biogeographic realm', bbox: [-25, 15, 180, 84] },
  { id: 'realm-afrotropic', label: 'Afrotropic', group: 'Biogeographic realm', bbox: [-26, -35, 64, 27] },
  { id: 'realm-indomalayan', label: 'Indomalayan', group: 'Biogeographic realm', bbox: [60, -11, 135, 35] },
  { id: 'realm-australasian', label: 'Australasian', group: 'Biogeographic realm', bbox: [115, -48, 180, 0] },
  { id: 'realm-oceanian', label: 'Oceanian', group: 'Biogeographic realm', bbox: [130, -30, -105, 30] },

  { id: 'ocean-north-atlantic', label: 'North Atlantic', group: 'Ocean', bbox: [-100, 0, 20, 70] },
  { id: 'ocean-south-atlantic', label: 'South Atlantic', group: 'Ocean', bbox: [-70, -60, 20, 0] },
  { id: 'ocean-indian', label: 'Indian Ocean', group: 'Ocean', bbox: [20, -60, 147, 30] },
  { id: 'ocean-pacific', label: 'Pacific Ocean', group: 'Ocean', bbox: [120, -60, -70, 66] },
  { id: 'ocean-arctic', label: 'Arctic Ocean', group: 'Ocean', bbox: [-180, 66, 180, 90] },
  { id: 'ocean-southern', label: 'Southern Ocean', group: 'Ocean', bbox: [-180, -80, 180, -50] },
  { id: 'ocean-mediterranean', label: 'Mediterranean Sea', group: 'Ocean', bbox: [-6, 30, 37, 46] },
  { id: 'ocean-caribbean', label: 'Caribbean Sea', group: 'Ocean', bbox: [-89, 9, -60, 22] },
  { id: 'ocean-coral-triangle', label: 'Coral Triangle', group: 'Ocean', bbox: [114, -11, 163, 20] },
];

export function regionById(id: string): RegionPreset | undefined {
  return REGION_PRESETS.find((r) => r.id === id);
}

/** The preset whose box equals `bbox`, if any. */
export function regionByBbox(bbox: BBox): RegionPreset | undefined {
  return REGION_PRESETS.find((r) => r.bbox.every((v, i) => Math.abs(v - bbox[i]) < 1e-9));
}

/**
 * ISO 3166-1 alpha-2 codes of all current countries and territories (249), plus
 * XK (Kosovo), a user-assigned code that GBIF uses.
 */
export const COUNTRY_CODES: string[] = `
AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ
BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ
CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ
DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR
GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY
HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP
KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY
MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ
NA NC NE NF NG NI NL NO NP NR NU NZ OM
PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW
SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ
TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ
VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW
`
  .trim()
  .split(/\s+/);

let displayNames: Intl.DisplayNames | null | undefined;

/** English country name for an ISO code, falling back to the code itself. */
export function countryName(code: string): string {
  const upper = code.toUpperCase();
  if (displayNames === undefined) {
    try {
      displayNames = new Intl.DisplayNames(['en'], { type: 'region' });
    } catch {
      displayNames = null;
    }
  }
  try {
    return displayNames?.of(upper) ?? upper;
  } catch {
    return upper;
  }
}

/** All countries with English names, sorted by name. */
export const COUNTRIES: { code: string; name: string }[] = COUNTRY_CODES.map((code) => ({
  code,
  name: countryName(code),
})).sort((a, b) => a.name.localeCompare(b.name, 'en'));

const round1 = (x: number) => String(Math.round(Math.abs(x) * 10) / 10);

function latLabel(lat: number): string {
  if (Math.abs(lat) < 0.05) return '0°';
  return `${round1(lat)}°${lat < 0 ? 'S' : 'N'}`;
}

function lonLabel(lon: number): string {
  if (Math.abs(lon) < 0.05 || Math.abs(Math.abs(lon) - 180) < 0.05) {
    return Math.abs(lon) < 0.05 ? '0°' : '180°';
  }
  return `${round1(lon)}°${lon < 0 ? 'W' : 'E'}`;
}

/** Rounded box coordinates, e.g. "10°S–5°N, 80°W–60°W". */
export function bboxLabel([w, s, e, n]: BBox): string {
  return `${latLabel(s)}–${latLabel(n)}, ${lonLabel(w)}–${lonLabel(e)}`;
}

/** Up to `max` items joined, then "+ N more". */
export function joinWithMore(items: string[], max = 3): string {
  if (items.length <= max) return items.join(', ');
  return `${items.slice(0, max).join(', ')} + ${items.length - max} more`;
}

/** Short human-readable label for an area filter. */
export function areaLabel(area: AreaFilter): string {
  switch (area.kind) {
    case 'world':
      return 'World';
    case 'bbox':
      return regionByBbox(area.bbox)?.label ?? area.label ?? bboxLabel(area.bbox);
    case 'countries':
      return area.codes.length === 0 ? 'No countries' : joinWithMore(area.codes.map(countryName));
    case 'wkt':
      return area.label ?? 'Custom polygon';
  }
}
