import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../../src/storage/settings';

describe('sanitizeSettings', () => {
  it('returns defaults for missing or corrupt data', () => {
    expect(sanitizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings('garbage')).toEqual(DEFAULT_SETTINGS);
  });

  it('keeps valid values and rejects invalid ones', () => {
    const result = sanitizeSettings({
      aiProvider: 'openai',
      model: '  my-model ',
      baseUrl: 'https://proxy.example/v1///',
      tone: 'creative',
      tagCount: 7,
      defaultTags: ['My Studio', 3, '#brand'],
    });
    expect(result).toEqual({
      aiProvider: 'openai',
      model: 'my-model',
      baseUrl: 'https://proxy.example/v1',
      tone: 'creative',
      tagCount: DEFAULT_SETTINGS.tagCount,
      defaultTags: ['my-studio', 'brand'],
    });
  });

  it('never stores an API key in synced settings', () => {
    expect(sanitizeSettings({ apiKey: 'sk-secret' })).not.toHaveProperty('apiKey');
  });
});
