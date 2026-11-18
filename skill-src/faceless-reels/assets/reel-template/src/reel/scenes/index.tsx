// The element scenes, in order. Replace each entry with {C: Element1, sfx: e1Sfx}, etc. as they get written.
import {ELEMENTS} from '../data';
import type {Sfx} from '../kit';
import {PlaceholderElement, placeholderSfx} from './PlaceholderElement';

export const SCENES: {C: React.FC; sfx: Sfx[]}[] = ELEMENTS.map((sec) => ({C: () => <PlaceholderElement sec={sec} />, sfx: placeholderSfx(sec)}));
