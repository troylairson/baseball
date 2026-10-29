import type { HomeLayout } from '../../engine';

/** Every card the home screen can show, in their default order, with names for the editor. */
export const HOME_CARDS = [
  { id: 'trends', label: 'Trends (with suggested moves)', wide: true },
  { id: 'todo', label: 'To do' },
  { id: 'games', label: 'Next game / playoffs' },
  { id: 'injuries', label: 'Injured list' },
  { id: 'hotcold', label: 'Hot & cold' },
  { id: 'hitters', label: 'Top hitters' },
  { id: 'pitchers', label: 'Pitching leaders' },
  { id: 'farm', label: 'Triple-A' },
  { id: 'owner', label: 'Owner' },
  { id: 'assistant', label: 'Assistant GM' },
  { id: 'news', label: 'News', wide: true },
  { id: 'division', label: 'Division standings', wide: true },
] as const;

export type HomeCardId = (typeof HOME_CARDS)[number]['id'];

/** Most columns the home grid offers; fewer show when the screen is too narrow for them. */
export const MAX_COLUMNS = 6;

/**
 * Grid classes for each column choice. Columns are added as the home area
 * gets wider, keeping cards at least ~250px: the choice is a maximum.
 * (Literal strings, so Tailwind generates them.)
 */
export const GRID_CLASSES: Record<number, string> = {
  1: '',
  2: '@lg:grid-cols-2',
  3: '@lg:grid-cols-2 @[49rem]:grid-cols-3',
  4: '@lg:grid-cols-2 @[49rem]:grid-cols-3 @[66rem]:grid-cols-4',
  5: '@lg:grid-cols-2 @[49rem]:grid-cols-3 @[66rem]:grid-cols-4 @[82rem]:grid-cols-5',
  6: '@lg:grid-cols-2 @[49rem]:grid-cols-3 @[66rem]:grid-cols-4 @[82rem]:grid-cols-5 @[99rem]:grid-cols-6',
};

export const DEFAULT_LAYOUT: HomeLayout = {
  columns: 2,
  cards: HOME_CARDS.map((c) => ({ id: c.id, hidden: false, wide: 'wide' in c ? c.wide : false })),
};

/** The saved layout, with any cards added since it was saved appended at the end. */
export function resolveLayout(saved: HomeLayout | undefined): HomeLayout {
  if (!saved) return DEFAULT_LAYOUT;
  const known = new Set<string>(HOME_CARDS.map((c) => c.id));
  const cards = saved.cards.filter((c) => known.has(c.id));
  for (const d of DEFAULT_LAYOUT.cards) if (!cards.some((c) => c.id === d.id)) cards.push(d);
  const columns = Number.isInteger(saved.columns) && saved.columns >= 1 && saved.columns <= MAX_COLUMNS ? saved.columns : 2;
  return { columns, cards };
}
