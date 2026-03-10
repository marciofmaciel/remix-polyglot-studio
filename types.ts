
export interface Language {
  code: string;
  name: string;
  flag: string;
  countryCode?: string;
}

export interface TranscriptionEntry {
  id: string;
  speaker: 'A' | 'B';
  role: 'original' | 'translation';
  languageName: string;
  text: string;
  timestamp: number;
}

export const AUTO_DETECT: Language = { code: 'auto', name: 'Auto Detect', flag: '✨' };

export const SUPPORTED_LANGUAGES: Language[] = [
  AUTO_DETECT,
  { code: 'en-US', name: 'English', flag: '🇺🇸', countryCode: 'us' },
  { code: 'pt-BR', name: 'Portuguese', flag: '🇧🇷', countryCode: 'br' },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸', countryCode: 'es' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷', countryCode: 'fr' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪', countryCode: 'de' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵', countryCode: 'jp' },
  { code: 'zh-CN', name: 'Mandarin Chinese', flag: '🇨🇳', countryCode: 'cn' },
  { code: 'it-IT', name: 'Italian', flag: '🇮🇹', countryCode: 'it' },
  { code: 'ru-RU', name: 'Russian', flag: '🇷🇺', countryCode: 'ru' },
  { code: 'ko-KR', name: 'Korean', flag: '🇰🇷', countryCode: 'kr' },
  { code: 'ar-SA', name: 'Arabic', flag: '🇸🇦', countryCode: 'sa' },
  { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳', countryCode: 'in' },
  { code: 'tr-TR', name: 'Turkish', flag: '🇹🇷', countryCode: 'tr' },
  { code: 'nl-NL', name: 'Dutch', flag: '🇳🇱', countryCode: 'nl' },
];
