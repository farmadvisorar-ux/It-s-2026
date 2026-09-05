import pb from '../data/portable-buildings.json';

/**
 * Optional pricing for the wood portable buildings.
 *
 * Steel kits are quoted per site — freight and engineering both depend on the
 * address — so they stay "request pricing". The wood line is a catalogue of
 * fixed models, so it can carry real numbers.
 *
 * Everything here is optional by design. A product with no `pricing` block
 * renders exactly as it did before this existed: no columns, no "from"
 * figure, no Offer in the schema. That matters because publishing a price is
 * a commitment — a half-filled table that shows $0, or a monthly payment with
 * no term attached, is worse than showing nothing.
 *
 * Shape, keyed by the same size strings the `sizes` array already uses:
 *
 *   "pricing": {
 *     "term": 48,
 *     "sizes": { "8x12": { "cash": 2495, "monthly": 104 } }
 *   }
 */
export interface SizePrice {
  /** Delivered cash price in whole dollars. */
  cash?: number;
  /** Rent-to-own payment per month, in whole dollars. */
  monthly?: number;
}

interface ProductPricing {
  /** Months the monthly figure is based on. Required for monthly to render. */
  term?: number;
  sizes?: Record<string, SizePrice>;
}

const line = (pb as any).line ?? {};

/** Default rent-to-own term, when a product does not set its own. */
export const defaultTerm: number | undefined = line.pricing?.term;

export const usd = (n: number): string =>
  `$${Math.round(n).toLocaleString('en-US')}`;

const pricingOf = (product: any): ProductPricing | undefined => product?.pricing;

export const termFor = (product: any): number | undefined =>
  pricingOf(product)?.term ?? defaultTerm;

/** Price for one size, or undefined when that size has none. */
export function priceFor(product: any, size: string): SizePrice | undefined {
  const p = pricingOf(product)?.sizes?.[size];
  if (!p) return undefined;
  const cash = typeof p.cash === 'number' && p.cash > 0 ? p.cash : undefined;
  const monthly = typeof p.monthly === 'number' && p.monthly > 0 ? p.monthly : undefined;
  return cash || monthly ? { cash, monthly } : undefined;
}

/** True when at least one size carries a usable figure. */
export const hasPricing = (product: any): boolean =>
  (product?.sizes ?? []).some((s: string) => priceFor(product, s));

/** Cheapest cash price across the sizes, for a "from $X" line. */
export function priceFrom(product: any): number | undefined {
  const all = (product?.sizes ?? [])
    .map((s: string) => priceFor(product, s)?.cash)
    .filter((n: number | undefined): n is number => typeof n === 'number');
  return all.length ? Math.min(...all) : undefined;
}

/** Cheapest monthly across the sizes. Only meaningful alongside a term. */
export function monthlyFrom(product: any): number | undefined {
  if (!termFor(product)) return undefined;
  const all = (product?.sizes ?? [])
    .map((s: string) => priceFor(product, s)?.monthly)
    .filter((n: number | undefined): n is number => typeof n === 'number');
  return all.length ? Math.min(...all) : undefined;
}

/** Do any products carry pricing at all? Gates index-level UI. */
export const anyPricing = (): boolean => ((pb as any).products ?? []).some(hasPricing);
