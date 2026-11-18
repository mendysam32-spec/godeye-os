// Shape of reel.json: everything that changes from one reel to the next without touching the edit.
import type {IconName} from '../components/Icon';
export type HeaderConfig = {
  kicker: string; // small monospaced line, in capitals
  before: string; // start of the title, can be empty
  word: string; // title word on the mint pill
  window: string; // title of the app window
  icon?: 'claude' | IconName; // Claude mark only when the topic is Claude
  size?: number; // title font size when the title is long (68 by default)
};

export type ReelConfig = {
  id: string; // name of the exported files
  language: string; // ISO code of the reel language ("en", "fr"...)
  hook: {video: boolean}; // true: public/reel/hook.mp4 exists; false: still image of the studio
  stakes: {
    titles: {word: string; n?: number; text: string; accent?: string}[]; // one idea per phase, triggered by a word
    boxes_word: string; // word on which the empty boxes appear
    boxes_title: string; // text under the boxes, e.g. "5 settings"
  };
  headers: HeaderConfig[]; // one per element
  overview: HeaderConfig; // header of the recap
  recap: {
    lines: {text: string; tag: string; word: string; n?: number}[]; // one line per element
    strike?: {word: string; text: string}; // what the reel buries, optional ("Chatbot")
    peak: {word: string; n?: number; before: string; accent: string}; // final phrase on the big pill
  };
  guide: {
    title: string; // "The 5 settings guide"
    keyword: string; // the keyword, in capitals
    card: string; // big title of the card
    items: string[]; // checked lines of the card
    link: string; // "LINK IN BIO"
    words: {subscribe: string; link: string; click: string; keyword: string}; // voice words that trigger each gesture
  };
  cover: {
    lines: string[]; // black lines
    block: string; // last line, white on a black block
    logos: string[]; // names of square PNG files in public/reel/logos, without extension (2 at most, can be empty)
  };
};
