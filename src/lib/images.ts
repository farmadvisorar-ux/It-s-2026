import images from '../data/images.json';

type ImageMap = {
  types: Record<string, string[]>;
  inventory: Record<string, string>;
  options: Record<string, string>;
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
