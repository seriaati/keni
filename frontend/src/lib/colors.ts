import { useTheme } from './theme';
import type { Theme } from './theme';

export type PaletteColor = {
  id: string;
  light: string;
  dark: string;
};

export type ColorGroup = {
  label: string;
  shades: PaletteColor[];
};

// Stored values are either a palette id (e.g. 'green-1') or a custom '#rrggbb'.
// Ids are persisted in the DB — never rename or renumber them.
export const COLOR_GROUPS: ColorGroup[] = [
  {
    label: 'Green',
    shades: [
      { id: 'green-1', light: '#6aab8a', dark: '#78c39d' },
      { id: 'green-2', light: '#5e8c6a', dark: '#6ea37c' },
      { id: 'green-3', light: '#7a9e7e', dark: '#8cb590' },
      { id: 'green-4', light: '#4a7c6f', dark: '#599283' },
      { id: 'green-5', light: '#7ab89a', dark: '#89d0ae' },
    ],
  },
  {
    label: 'Blue',
    shades: [
      { id: 'blue-1', light: '#7a9fd0', dark: '#8bb5ed' },
      { id: 'blue-2', light: '#6b8fba', dark: '#7ba5d6' },
      { id: 'blue-3', light: '#5a7aaa', dark: '#6a8fc6' },
      { id: 'blue-4', light: '#4a6fa0', dark: '#5984bc' },
      { id: 'blue-5', light: '#8aaac8', dark: '#9cc1e3' },
    ],
  },
  {
    label: 'Teal',
    shades: [
      { id: 'teal-1', light: '#6ab0b8', dark: '#77c8d1' },
      { id: 'teal-2', light: '#5a9ea8', dark: '#67b5c1' },
      { id: 'teal-3', light: '#4a8e98', dark: '#57a5b0' },
      { id: 'teal-4', light: '#7abac0', dark: '#88d2d9' },
      { id: 'teal-5', light: '#3a7e90', dark: '#4694a9' },
    ],
  },
  {
    label: 'Purple',
    shades: [
      { id: 'purple-1', light: '#9e80b8', dark: '#b693d4' },
      { id: 'purple-2', light: '#8b6fa8', dark: '#a282c3' },
      { id: 'purple-3', light: '#7a5e98', dark: '#9170b3' },
      { id: 'purple-4', light: '#6a4e88', dark: '#8060a3' },
      { id: 'purple-5', light: '#b090c8', dark: '#c8a4e4' },
    ],
  },
  {
    label: 'Pink',
    shades: [
      { id: 'pink-1', light: '#c07888', dark: '#dd8a9c' },
      { id: 'pink-2', light: '#b06b7a', dark: '#cc7d8e' },
      { id: 'pink-3', light: '#d08898', dark: '#ed9aad' },
      { id: 'pink-4', light: '#985868', dark: '#b3697c' },
      { id: 'pink-5', light: '#a87888', dark: '#c28b9d' },
    ],
  },
  {
    label: 'Red',
    shades: [
      { id: 'red-1', light: '#c08070', dark: '#dc9380' },
      { id: 'red-2', light: '#b07060', dark: '#cc8270' },
      { id: 'red-3', light: '#a06050', dark: '#bc725f' },
      { id: 'red-4', light: '#987060', dark: '#b18371' },
      { id: 'red-5', light: '#c89080', dark: '#e4a491' },
    ],
  },
  {
    label: 'Orange',
    shades: [
      { id: 'orange-1', light: '#c49a6a', dark: '#dfaf77' },
      { id: 'orange-2', light: '#b8895a', dark: '#d39d67' },
      { id: 'orange-3', light: '#d4a870', dark: '#efbd7d' },
      { id: 'orange-4', light: '#a07848', dark: '#ba8c54' },
      { id: 'orange-5', light: '#b89870', dark: '#d2ad7f' },
    ],
  },
  {
    label: 'Yellow',
    shades: [
      { id: 'yellow-1', light: '#b8a060', dark: '#d1b66c' },
      { id: 'yellow-2', light: '#a89050', dark: '#c1a55b' },
      { id: 'yellow-3', light: '#988040', dark: '#b0954b' },
      { id: 'yellow-4', light: '#c8b070', dark: '#e1c67c' },
      { id: 'yellow-5', light: '#887030', dark: '#a0843b' },
    ],
  },
  {
    label: 'Slate',
    shades: [
      { id: 'slate-1', light: '#8a9faa', dark: '#9db5c2' },
      { id: 'slate-2', light: '#7a8f9a', dark: '#8da5b2' },
      { id: 'slate-3', light: '#6a7f8a', dark: '#7c94a1' },
      { id: 'slate-4', light: '#5a6f7a', dark: '#6c8491' },
      { id: 'slate-5', light: '#9aafba', dark: '#aec6d2' },
    ],
  },
  {
    label: 'Brown',
    shades: [
      { id: 'brown-1', light: '#9a8070', dark: '#b29482' },
      { id: 'brown-2', light: '#8a7060', dark: '#a28471' },
      { id: 'brown-3', light: '#aa9080', dark: '#c3a592' },
      { id: 'brown-4', light: '#7a6050', dark: '#917361' },
      { id: 'brown-5', light: '#6a5040', dark: '#816350' },
    ],
  },
  {
    label: 'Mauve',
    shades: [
      { id: 'mauve-1', light: '#aa8aaa', dark: '#c39ec3' },
      { id: 'mauve-2', light: '#9a7a9a', dark: '#b28db2' },
      { id: 'mauve-3', light: '#8a6a8a', dark: '#a27da2' },
      { id: 'mauve-4', light: '#ba9aba', dark: '#d3aed3' },
      { id: 'mauve-5', light: '#7a5a7a', dark: '#916c91' },
    ],
  },
  {
    label: 'Sage',
    shades: [
      { id: 'sage-1', light: '#8aaa8a', dark: '#9dc19d' },
      { id: 'sage-2', light: '#7a9a7a', dark: '#8cb18c' },
      { id: 'sage-3', light: '#6a8a6a', dark: '#7ca17c' },
      { id: 'sage-4', light: '#9aba9a', dark: '#add2ad' },
      { id: 'sage-5', light: '#5a7a5a', dark: '#6b906b' },
    ],
  },
  {
    label: 'Neutral',
    shades: [
      { id: 'neutral-1', light: '#9ca3af', dark: '#b1b9c7' },
      { id: 'neutral-2', light: '#8b929c', dark: '#a0a8b3' },
      { id: 'neutral-3', light: '#a8aeb8', dark: '#bdc4d0' },
      { id: 'neutral-4', light: '#7a818b', dark: '#8e96a2' },
      { id: 'neutral-5', light: '#6b7280', dark: '#7f8797' },
    ],
  },
];

const PALETTE_BY_ID = new Map(COLOR_GROUPS.flatMap((g) => g.shades).map((c) => [c.id, c]));

export function isPaletteColor(value: string | null | undefined): boolean {
  return !!value && PALETTE_BY_ID.has(value);
}

/** Resolve a stored color (palette id or custom hex) to a hex for the given theme. */
export function resolveColor(value: string | null | undefined, theme: Theme): string | null {
  if (!value) return null;
  if (value.startsWith('#')) return value;
  return PALETTE_BY_ID.get(value)?.[theme] ?? null;
}

/** Hook returning a resolver bound to the active theme. */
export function useColor() {
  const theme = useTheme();
  return (value: string | null | undefined) => resolveColor(value, theme);
}
