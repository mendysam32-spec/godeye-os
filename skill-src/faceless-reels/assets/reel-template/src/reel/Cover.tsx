// Reel cover: black title on the white zone of the cover background, last line inverted on a black block, logos around the head.
// The 9:16 version is the first frame of the video; both versions are used as covers when publishing.
// Logos are square PNG files in public/reel/logos (cover.logos lists their names); with an empty list the cover has no logo.
import {AbsoluteFill, Img, staticFile} from 'remotion';
import {CONFIG} from './data';
import {COVER} from './theme';

const INK = '#0B0B0D';

const Logo: React.FC<{readonly x: number; readonly y: number; readonly size: number; readonly rotate: number; readonly name: string}> = ({x, y, size, rotate, name}) => (
  <div style={{position: 'absolute', left: x - size / 2, top: y - size / 2, width: size, height: size, rotate: `${rotate}deg`, borderRadius: size * 0.23, overflow: 'hidden', boxShadow: '0 22px 48px rgba(10,0,40,0.55), 0 0 0 5px #fff'}}>
    <Img src={staticFile(`reel/logos/${name}.png`)} style={{width: '100%', height: '100%', display: 'block', scale: '1.04'}} />
  </div>
);

// Two free spots around the head of the cover photo: above the raised finger, and right of the face.
// `h` is measured from the bottom of the image, so the spots stay on the photo in both versions.
const SPOTS = [
  {x: 166, h: 572, r: -9},
  {x: 890, h: 620, r: 8},
];

export const Cover: React.FC<{readonly base: string; readonly bottom: number; readonly center: number; readonly maxFont: number; readonly width: number}> = ({base, bottom, center, maxFont, width}) => {
  const lines = [...CONFIG.cover.lines, CONFIG.cover.block];
  // Archivo 900 in capitals: about 0.68 em per character
  const fontSize = Math.min(maxFont, Math.floor(width / (0.68 * Math.max(...lines.map((l) => l.length)))));
  return (
    <AbsoluteFill style={{backgroundColor: '#2B2B2D'}}>
      <Img src={staticFile(`reel/${base}`)} style={{position: 'absolute', left: 0, top: 0, width: 1080}} />
      <div style={{position: 'absolute', left: 60, top: center, transform: 'translateY(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'flex-start', fontFamily: COVER, fontWeight: 900, fontSize, lineHeight: `${fontSize * 1.1}px`, letterSpacing: '-0.015em', color: INK, whiteSpace: 'nowrap'}}>
        <div style={{borderLeft: `${fontSize * 0.075}px solid ${INK}`, paddingLeft: fontSize * 0.16}}>
          {CONFIG.cover.lines.map((t) => (
            <div key={t}>{t}</div>
          ))}
        </div>
        <div style={{marginTop: fontSize * 0.1, background: INK, color: '#fff', padding: `${fontSize * 0.03}px ${fontSize * 0.16}px`, borderRadius: fontSize * 0.05}}>{CONFIG.cover.block}</div>
      </div>
      {CONFIG.cover.logos.slice(0, 2).map((name, i) => (
        <Logo key={name} x={SPOTS[i].x} y={bottom - SPOTS[i].h} size={186} rotate={SPOTS[i].r} name={name} />
      ))}
    </AbsoluteFill>
  );
};

export const Cover9x16: React.FC = () => <Cover base="cover_base_9x16.png" bottom={1920} center={545} maxFont={134} width={890} />;
export const Cover2x3: React.FC = () => <Cover base="cover_base_2x3.png" bottom={1620} center={376} maxFont={112} width={890} />;
