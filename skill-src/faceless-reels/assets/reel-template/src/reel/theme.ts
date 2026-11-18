// Reel style: night blue and mint. Fonts and colors shared by every scene.
import {loadFont as loadArchivo} from '@remotion/google-fonts/Archivo';
import {loadFont as loadMono} from '@remotion/google-fonts/IBMPlexMono';
import {loadFont as loadInter} from '@remotion/google-fonts/Inter';
import {loadFont as loadGrotesk} from '@remotion/google-fonts/SpaceGrotesk';

export const {fontFamily: DISPLAY} = loadGrotesk('normal', {weights: ['500', '600', '700'], subsets: ['latin', 'latin-ext']});
export const {fontFamily: BODY} = loadInter('normal', {weights: ['400', '500', '600', '700'], subsets: ['latin', 'latin-ext']});
export const {fontFamily: MONO} = loadMono('normal', {weights: ['500', '600'], subsets: ['latin', 'latin-ext']});
export const {fontFamily: COVER} = loadArchivo('normal', {weights: ['700', '900'], subsets: ['latin', 'latin-ext']});

export const C = {
  bg: '#0A1118',
  bg2: '#0F1A25',
  card: '#121D29',
  card2: '#172434',
  line: 'rgba(255,255,255,0.10)',
  text: '#F3F6FA',
  muted: '#8E9DAF',
  dim: '#5C6A7A',
  mint: '#5FE3C1',
  mintDeep: '#1FB98F',
  magenta: '#D44FB3',
  violet: '#7B4FE0',
  hermes: '#4DA8FF',
  gold: '#F5C451',
  pink: '#F29BC6',
  red: '#FF6B6B',
} as const;
