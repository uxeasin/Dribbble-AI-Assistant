import { useCallback, useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, getSettings, hasApiKey, saveSettings, setApiKey } from '../../storage/settings';
import type { UserSettings } from '../../types';

export function useSettings() {
  const [settings, setSettings] = useState<Required<UserSettings>>(DEFAULT_SETTINGS);
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const value = await getSettings();
      const configured = await hasApiKey(value.aiProvider);
      if (!active) return;
      setSettings(value);
      setKeyConfigured(configured);
      setLoaded(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(async (next: UserSettings, apiKey?: string) => {
    const saved = await saveSettings(next);
    if (apiKey !== undefined) await setApiKey(saved.aiProvider, apiKey);
    setSettings(saved);
    setKeyConfigured(await hasApiKey(saved.aiProvider));
    return saved;
  }, []);

  const removeKey = useCallback(async () => {
    await setApiKey(settings.aiProvider, '');
    setKeyConfigured(await hasApiKey(settings.aiProvider));
  }, [settings.aiProvider]);

  return { settings, keyConfigured, loaded, save, removeKey };
}
