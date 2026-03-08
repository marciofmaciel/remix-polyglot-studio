
export interface Language {
  code: string;
  name: string;
  flag: string;
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
  { code: 'en-US', name: 'English', flag: '🇺🇸' },
  { code: 'pt-BR', name: 'Portuguese', flag: '🇧🇷' },
  { code: 'es-ES', name: 'Spanish', flag: '🇪🇸' },
  { code: 'fr-FR', name: 'French', flag: '🇫🇷' },
  { code: 'de-DE', name: 'German', flag: '🇩🇪' },
  { code: 'ja-JP', name: 'Japanese', flag: '🇯🇵' },
  { code: 'zh-CN', name: 'Mandarin Chinese', flag: '🇨🇳' },
  { code: 'it-IT', name: 'Italian', flag: '🇮🇹' },
  { code: 'ru-RU', name: 'Russian', flag: '🇷🇺' },
  { code: 'ko-KR', name: 'Korean', flag: '🇰🇷' },
  { code: 'ar-SA', name: 'Arabic', flag: '🇸🇦' },
  { code: 'hi-IN', name: 'Hindi', flag: '🇮🇳' },
  { code: 'tr-TR', name: 'Turkish', flag: '🇹🇷' },
  { code: 'nl-NL', name: 'Dutch', flag: '🇳🇱' },
];
