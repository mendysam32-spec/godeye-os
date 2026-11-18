// Fixed on-screen words of the template (call to action), per reel language (CONFIG.language).
// Unknown languages fall back to English: add an entry here for a new language.
import {CONFIG} from './data';

type Labels = {guide: string; keywordTitle: string; keyword: string; subscribe: string; subscribed: string; save: string};

const LABELS: Record<string, Labels> = {
  en: {guide: 'The guide', keywordTitle: 'Keyword', keyword: 'KEYWORD', subscribe: 'Subscribe', subscribed: 'Subscribed', save: 'Save it'},
  fr: {guide: 'Le guide', keywordTitle: 'Mot-clé', keyword: 'MOT-CLÉ', subscribe: "S'abonner", subscribed: 'Abonné', save: 'Enregistre'},
};

export const labels = (): Labels => LABELS[CONFIG.language] ?? LABELS.en;
