import { loadNamespaced, saveNamespaced } from './persistence';

/** Workspace skin. Composes with the light/dark colour mode (data-mode). */
export type Skin = 'classic' | 'retro-lcd' | 'y2k-pop' | 'cult-of-the-lamb';

export const SKINS: { value: Skin; label: string; hint: string }[] = [
  {
    value: 'classic',
    label: 'Classic',
    hint: 'Clean flat design in the current palette. Best for dense tables.',
  },
  {
    value: 'retro-lcd',
    label: 'Retro LCD',
    hint: 'Monochrome olive-green LCD look with condensed all-caps labels.',
  },
  {
    value: 'y2k-pop',
    label: 'Y2K Pop',
    hint: 'Bold pink/teal pop with heavy black outlines and a playful heading font.',
  },
  {
    value: 'cult-of-the-lamb',
    label: 'Cult of the Lamb',
    hint: 'Dark gothic-cult palette: crimson, muted gold, and parchment form fields.',
  },
];

// Default skin. NOTE: dense tables read best on Classic — consider making
// Classic the default if users report readability issues with Y2K Pop.
export const DEFAULT_SKIN: Skin = 'y2k-pop';

// Persisted under the workspace namespace: localStorage "ucc:workspace:theme".
const TOOL_ID = 'workspace';
const KEY = 'theme';

const isSkin = (v: unknown): v is Skin =>
  v === 'classic' ||
  v === 'retro-lcd' ||
  v === 'y2k-pop' ||
  v === 'cult-of-the-lamb';

export function loadSkin(): Skin {
  const v = loadNamespaced<unknown>(TOOL_ID, KEY, DEFAULT_SKIN);
  return isSkin(v) ? v : DEFAULT_SKIN;
}

export function saveSkin(skin: Skin): void {
  saveNamespaced(TOOL_ID, KEY, skin);
}
