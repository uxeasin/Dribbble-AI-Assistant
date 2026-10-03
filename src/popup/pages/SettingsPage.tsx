import { useEffect, useState, type FormEvent } from 'react';
import { getProviderDescriptor, PROVIDERS } from '../../ai/providers';
import { TAG_COUNT_OPTIONS, type TagCount, type Tone, type UserSettings } from '../../types';
import { Button, IconButton } from '../components/Button';
import { Notice } from '../components/Notice';
import { Segmented } from '../components/Segmented';
import { TagEditor } from '../components/TagEditor';
import type { useSettings } from '../hooks/useSettings';

type SettingsApi = ReturnType<typeof useSettings>;

const TONES: readonly { value: Tone; label: string }[] = [
  { value: 'professional', label: 'Professional' },
  { value: 'minimal', label: 'Minimal' },
  { value: 'creative', label: 'Creative' },
];

/** Requests host access for a non-default API endpoint. Must run inside the click handler (user gesture). */
function requestHostPermission(baseUrl: string): Promise<boolean> {
  let origin: string;
  try {
    const url = new URL(baseUrl);
    if (url.protocol !== 'https:') return Promise.resolve(false);
    origin = `${url.origin}/*`;
  } catch {
    return Promise.resolve(false);
  }
  return chrome.permissions.request({ origins: [origin] });
}

export function SettingsPage({ api }: { api: SettingsApi }) {
  const { settings, keyConfigured, loaded, save, removeKey } = api;
  const [form, setForm] = useState<Required<UserSettings>>(settings);
  const [apiKey, setApiKeyInput] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loaded) setForm(settings);
  }, [loaded, settings]);

  const descriptor = getProviderDescriptor(form.aiProvider);
  const patch = (changes: Partial<UserSettings>) => {
    setForm((f) => ({ ...f, ...changes }) as Required<UserSettings>);
    setStatus(null);
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    try {
      const baseUrl = form.baseUrl.trim() || descriptor.defaultBaseUrl;
      if (baseUrl.replace(/\/+$/, '') !== descriptor.defaultBaseUrl) {
        const granted = await requestHostPermission(baseUrl);
        if (!granted) {
          setStatus({ tone: 'error', text: 'Access to that API URL was not granted (an https:// URL is required).' });
          return;
        }
      }
      await save({ ...form, baseUrl }, apiKey.trim() ? apiKey : undefined);
      setApiKeyInput('');
      setStatus({ tone: 'success', text: 'Settings saved.' });
    } catch (error) {
      setStatus({ tone: 'error', text: `Couldn't save settings: ${(error as Error).message}` });
    } finally {
      setSaving(false);
    }
  };

  return (
    <form className="page" onSubmit={onSubmit}>
      <section className="section" aria-labelledby="ai-heading">
        <h2 className="section__title" id="ai-heading">
          AI provider
        </h2>
        <div className="field">
          <label className="field__label" htmlFor="provider">
            Provider
          </label>
          <select
            id="provider"
            className="select"
            value={form.aiProvider}
            onChange={(e) => {
              const next = getProviderDescriptor(e.target.value);
              patch({ aiProvider: next.id, baseUrl: next.defaultBaseUrl, model: next.defaultModel });
            }}
          >
            {PROVIDERS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <div className="field__head">
            <label className="field__label" htmlFor="api-key">
              API key
            </label>
            {keyConfigured !== null && (
              <span className={`status-pill ${keyConfigured ? '' : 'status-pill--missing'}`}>
                {keyConfigured ? '● Saved on this device' : '● Not set'}
              </span>
            )}
          </div>
          <div className="input-group">
            <input
              id="api-key"
              className="input"
              type={showKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder={keyConfigured ? '•••••••• (leave blank to keep)' : descriptor.keyPlaceholder}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="api-key-hint"
            />
            <IconButton icon={showKey ? 'eyeOff' : 'eye'} label={showKey ? 'Hide key' : 'Show key'} size="sm" onClick={() => setShowKey((v) => !v)} />
          </div>
          <p className="field__hint" id="api-key-hint">
            Stored only in this browser's local extension storage — never synced or sent anywhere except {descriptor.label}.{' '}
            <a href={descriptor.keyUrl} target="_blank" rel="noreferrer">
              Get a key
            </a>
            {keyConfigured && (
              <>
                {' · '}
                <button type="button" className="link-btn" onClick={() => void removeKey()}>
                  Remove key
                </button>
              </>
            )}
          </p>
        </div>

        <details>
          <summary>Advanced</summary>
          <div className="stack">
            <div className="field">
              <label className="field__label" htmlFor="model">
                Model
              </label>
              <input id="model" className="input" value={form.model} onChange={(e) => patch({ model: e.target.value })} spellCheck={false} />
              <p className="field__hint">Must support image input.</p>
            </div>
            <div className="field">
              <label className="field__label" htmlFor="base-url">
                API base URL
              </label>
              <input
                id="base-url"
                className="input"
                type="url"
                value={form.baseUrl}
                onChange={(e) => patch({ baseUrl: e.target.value })}
                spellCheck={false}
              />
              <p className="field__hint">For OpenAI-compatible endpoints. Other hosts need your permission.</p>
            </div>
          </div>
        </details>
      </section>

      <section className="section" aria-labelledby="content-heading">
        <h2 className="section__title" id="content-heading">
          Content preferences
        </h2>
        <div className="field">
          <span className="field__label">
            Tone
          </span>
          <Segmented label="Tone" value={form.tone} options={TONES} onChange={(tone) => patch({ tone })} />
        </div>
        <div className="field">
          <span className="field__label">Tag count</span>
          <Segmented<TagCount>
            label="Tag count"
            value={form.tagCount}
            options={TAG_COUNT_OPTIONS.map((n) => ({ value: n, label: String(n) }))}
            onChange={(tagCount) => patch({ tagCount })}
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="default-tags">
            Always include tags
          </label>
          <TagEditor id="default-tags" tags={form.defaultTags} onChange={(defaultTags) => patch({ defaultTags })} max={10} placeholder="e.g. your-studio" />
        </div>
      </section>

      <section className="section" aria-labelledby="privacy-heading">
        <h2 className="section__title" id="privacy-heading">
          Privacy
        </h2>
        <ul className="privacy-list">
          <li>
            <strong>Processed locally</strong>
            Validating your image, reading its size and dimensions, creating previews and resizing it before analysis.
          </li>
          <li>
            <strong>Sent to {descriptor.label}</strong>
            Only the image you select (resized to at most 1536 px) and the text prompts, sent directly from your browser when you click
            "Prepare Shot" or regenerate. No Dribbble data, cookies or browsing history.
          </li>
          <li>
            <strong>Sent to Dribbble</strong>
            Your original image and the content you approved, through Dribbble's own upload page in your logged-in session, only when you
            click "Upload to Dribbble". The extension never publishes.
          </li>
          <li>
            <strong>Stored</strong>
            Your preferences (synced with your browser profile) and your API key (this device only). The current image and draft are kept
            in temporary session memory and cleared when you start over or close the browser.
          </li>
        </ul>
      </section>

      {status && <Notice tone={status.tone}>{status.text}</Notice>}

      <div className="page__footer page__footer--sticky">
        <Button type="submit" block loading={saving} disabled={!loaded}>
          Save settings
        </Button>
      </div>
    </form>
  );
}
