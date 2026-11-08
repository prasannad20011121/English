export type Role = 'student' | 'admin';
export type TtsAccent = 'en-IN' | 'en-US' | 'en-GB';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  college: string | null;
  /** ISO timestamp (midnight UTC of the chosen day) or null. */
  targetExamDate: string | null;
  settings: { ttsAccent: TtsAccent };
  createdAt: string | null;
  lastLoginAt: string | null;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  college?: string;
  /** YYYY-MM-DD */
  targetExamDate?: string | null;
  consentAudio: true;
}

export interface ProfileUpdate {
  name?: string;
  college?: string | null;
  targetExamDate?: string | null;
  settings?: { ttsAccent?: TtsAccent };
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export const TTS_ACCENT_LABELS: Record<TtsAccent, string> = {
  'en-IN': 'Indian English',
  'en-US': 'American English',
  'en-GB': 'British English',
};
