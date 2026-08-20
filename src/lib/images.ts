import images from '../data/images.json';

type ImageMap = {
  types: Record<string, string[]>;
  inventory: Record<string, string>;
  options: Record<string, string>;
  portable: {
    products: Record<string, string[]>;
    plans: Record<string, string>;
    details: string[];
    colors: string;
  };
  hero: string | null;
};

const map = images as ImageMap;

/** Every photo we have for a building type, in display order. */
export const typeImages = (slug: string): string[] => map.types[slug] ?? [];

/** Lead photo for a building type, or undefined to fall back to a placeholder. */
export const typeImage = (slug: string, index = 0): string | undefined =>
  map.types[slug]?.[index];

/** Photo for a clearance listing. */
export const inventoryImage = (slug: string): string | undefined =>
  map.inventory[slug];

/** Photo for an option, keyed `${family}-${slug}`. Not every option has one. */
export const optionImage = (family: string, slug: string): string | undefined =>
  map.options?.[`${family}-${slug}`];

/** Every photo for a portable-building model, in display order. */
export const portableImages = (slug: string): string[] => map.portable?.products[slug] ?? [];

/** Lead photo for a portable-building model. */
export const portableImage = (slug: string, index = 0): string | undefined =>
  map.portable?.products[slug]?.[index];

/** Floor plan drawing by plan number, e.g. "805". */
export const planImage = (num: string): string | undefined => map.portable?.plans[num];

/** Construction detail shots used on the "how it is built" sections. */
export const detailImages = (): string[] => map.portable?.details ?? [];

/** Paint, shingle and metal roof colour chart. */
export const colorChart = (): string | undefined => map.portable?.colors;

/** Homepage lead image. */
export const heroImage = (): string | undefined => map.hero ?? undefined;

/**
 * Representative photo for a building model. Models have no photos of their
 * own, so borrow the lead image of a building type that uses that profile.
 */
export const modelImage = (
  code: string,
  types: { slug: string; models: string[] }[]
): string | undefined => {
  const match = types.find((t) => t.models?.[0] === code) ?? types.find((t) => t.models?.includes(code));
  return match ? typeImage(match.slug) : undefined;
};
