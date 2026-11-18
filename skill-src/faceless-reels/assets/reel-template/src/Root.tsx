import {Composition, Folder} from 'remotion';
import {Cover2x3, Cover9x16} from './reel/Cover';
import {TOTAL} from './reel/data';
import {Reel} from './reel/Reel';

export const RemotionRoot: React.FC = () => {
  return (
    <Folder name="Reel">
      <Composition id="Reel" component={Reel} durationInFrames={TOTAL} fps={30} width={1080} height={1920} />
      <Composition id="Reel-audio" component={() => <Reel audioOnly />} durationInFrames={TOTAL} fps={30} width={180} height={320} />
      <Composition id="Reel-Cover" component={Cover9x16} durationInFrames={1} fps={30} width={1080} height={1920} />
      <Composition id="Reel-Cover-2x3" component={Cover2x3} durationInFrames={1} fps={30} width={1080} height={1620} />
    </Folder>
  );
};
