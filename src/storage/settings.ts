// User preferences live in chrome.storage.sync (non-sensitive, roams with the
// profile). The API key lives in chrome.storage.local only: it is never synced,
// never exposed to content scripts, and never written anywhere else.

import { TAG_COUNT_OPTIONS, type TagCount, type Tone, type UserSettings } from '../types';
import { normalizeTags } from '../utils/tags';

const SETTINGS_KEY = 'settings';
const API_KEY_PREFIX = 'apiKey:';

export const DEFAULT_SETTINGS: Required<UserSettings> = {
  aiProvider: import.meta.env.VITE_AI_PROVIDER || 'openai',
  model: import.meta.env.VITE_AI_MODEL || 'gpt-4o-mini',
  baseUrl: import.meta.env.VITE_AI_BASE_URL || 'https://api.openai.com/v1',
  defaultTags: [],
  tone: 'professional',
  tagCount: 8,
};

const TONES: readonly Tone[] = ['professional', 'minimal', 'creative'];

/** Coerces untrusted stored data into valid settings, falling back to defaults. */
export function sanitizeSettings(raw: unknown): Required<UserSettings> {
  const value = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

  return {
    aiProvider: str(value.aiProvider, DEFAULT_SETTINGS.aiProvider),
    model: str(value.model, DEFAULT_SETTINGS.model),
    baseUrl: str(value.baseUrl, DEFAULT_SETTINGS.baseUrl).replace(/\/+$/, ''),
    defaultTags: Array.isArray(value.defaultTags)
      ? normalizeTags(value.defaultTags.filter((t): t is string => typeof t === 'string'))
      : [],
    tone: TONES.includes(value.tone as Tone) ? (value.tone as Tone) : DEFAULT_SETTINGS.tone,
    tagCount: TAG_COUNT_OPTIONS.includes(value.tagCount as TagCount)
      ? (value.tagCount as TagCount)
      : DEFAULT_SETTINGS.tagCount,
  };
}

export async function getSettings(): Promise<Required<UserSettings>> {
  const stored = await chrome.storage.sync.get(SETTINGS_KEY);
  return sanitizeSettings(stored[SETTINGS_KEY]);
}

export async function saveSettings(settings: UserSettings): Promise<Required<UserSettings>> {
  const clean = sanitizeSettings(settings);
  await chrome.storage.sync.set({ [SETTINGS_KEY]: clean });
  return clean;
}

export async function getApiKey(providerId: string): Promise<string | undefined> {
  const key = `${API_KEY_PREFIX}${providerId}`;
  const stored = await chrome.storage.local.get(key);
  const value = stored[key];
  if (typeof value === 'string' && value) return value;

  // Development convenience only; production builds never read this variable.
  if (import.meta.env.MODE === 'development' && providerId === 'openai') {
    return import.meta.env.VITE_DEV_OPENAI_API_KEY || undefined;
  }
  return undefined;
}

export async function setApiKey(providerId: string, apiKey: string): Promise<void> {
  const key = `${API_KEY_PREFIX}${providerId}`;
  const trimmed = apiKey.trim();
  if (trimmed) await chrome.storage.local.set({ [key]: trimmed });
  else await chrome.storage.local.remove(key);
}

export async function hasApiKey(providerId: string): Promise<boolean> {
  return Boolean(await getApiKey(providerId));
}
