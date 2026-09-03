import pb from '../data/portable-buildings.json';

/**
 * Shared model for the wood-building designer.
 *
 * Steel kits are deliberately excluded: they are engineered per site, quoted
 * per site, and have no fixed catalogue of finishes to choose from. The wood
 * line is a fixed set of models with a fixed set of finishes and add-ons,
 * which is exactly what can be configured meaningfully.
 */
export type RoofProfile = 'gable' | 'gambrel' | 'lean-to';

export interface Swatch {
  name: string;
  hex: string;
  image?: string;
  note?: string;
}

export interface AddOn {
  slug: string;
  name: string;
  size?: string;
  price: number;
  unit?: string;
  note?: string;
  /** Volume breaks, cheapest-qualifying wins. */
  tiers?: { minQty: number; price: number }[];
  group: string;
}

const data = pb as any;

export const paintOptions: Swatch[] = data.colors?.paint?.options ?? [];
export const shingleOptions: Swatch[] = data.colors?.shingles?.options ?? [];
export const metalRoofOptions: Swatch[] = data.colors?.metalRoof?.options ?? [];

export const addOns: AddOn[] = (data.addOns?.groups ?? []).flatMap((g: any) =>
  (g.items ?? []).map((i: any) => ({ ...i, group: g.name }))
);

/**
 * Unit price at a given quantity. Transoms drop from $110 to $95 once three
 * are ordered, and the break applies to the whole order rather than to the
 * third one onwards — so the total is qty x the qualifying unit price.
 */
export function unitPriceAt(item: AddOn, qty: number): number {
  const tier = (item.tiers ?? [])
    .filter((t) => qty >= t.minQty)
    .sort((a, b) => b.minQty - a.minQty)[0];
  return tier ? tier.price : item.price;
}

export const lineTotal = (item: AddOn, qty: number): number => unitPriceAt(item, qty) * qty;

/** "8x12" -> { w: 8, l: 12 }. Sizes are stored width-first. */
export function parseSize(size: string): { w: number; l: number } {
  const [w, l] = size.split('x').map((n) => Number(n.trim()));
  return { w: w || 8, l: l || 12 };
}

/**
 * Wall and ridge heights in feet.
 *
 * Where the copy states an overall height we use it. Where it does not, the
 * ridge is derived from the footprint rather than guessed at a fixed number —
 * a 6x6 coop and a 12x32 garage should not share a roofline.
 */
export function heights(product: any, size: string) {
  const { w } = parseSize(size);
  const roof: RoofProfile = product.roof ?? 'gable';
  const stated = product.overallHeightFt as number | undefined;
  const wall = roof === 'lean-to' ? 7.2 : 6.9;
  const ridge = stated ?? wall + (roof === 'gambrel' ? w * 0.42 : roof === 'lean-to' ? w * 0.18 : w * 0.34);
  return { wall: Math.min(wall, ridge - 0.8), ridge };
}

/**
 * Physical size of each add-on in feet, for the 3D model.
 *
 * The catalogue states these in inches for the customer ("24\" x 36\"") and the
 * doors not at all, so the conversion lives here rather than being re-derived
 * wherever it is needed. `run` is how far a ramp reaches out from the wall.
 */
export const addOnGeometry: Record<
  string,
  { kind: 'door' | 'window' | 'ramp'; w: number; h: number }
> = {
  transom: { kind: 'window', w: 30 / 12, h: 10 / 12 },
  'vinyl-window': { kind: 'window', w: 24 / 12, h: 36 / 12 },
  'single-door': { kind: 'door', w: 3, h: 6.7 },
  'double-door': { kind: 'door', w: 5, h: 6.7 },
  'nine-lite-door': { kind: 'door', w: 3, h: 6.7 },
  'garage-door': { kind: 'door', w: 8, h: 7 },
  // A pair of 24"-wide ramps side by side, reaching 48" or 72" out.
  'ramp-48': { kind: 'ramp', w: 4, h: 4 },
  'ramp-72': { kind: 'ramp', w: 4, h: 6 },
};

/**
 * Whether another opening still fits on a wall.
 *
 * Counting openings would be wrong: a 30" transom and an 8' garage door are
 * not interchangeable, and a flat limit either blocks a sensible row of small
 * windows or lets two garage doors onto an 8' wall. This measures the actual
 * width taken, leaving a margin at each end and a gap between openings, which
 * is what the framing needs anyway.
 */
const EDGE_MARGIN = 0.6;
const BETWEEN = 0.5;

export function wallFits(existingWidths: number[], nextWidth: number, spanFt: number): boolean {
  const widths = [...existingWidths, nextWidth];
  const used = widths.reduce((n, w) => n + w, 0) + BETWEEN * (widths.length - 1);
  return used + EDGE_MARGIN * 2 <= spanFt;
}
