import { useCallback, useEffect, useState } from 'react';
import { getProviderDescriptor } from '../ai/providers';
import { blobToDataUrl } from '../image/encoding';
import { validateImageFile } from '../image/validation';
import type { SerializedError, ShotContent, ShotField } from '../types';
import { serializeError } from '../utils/errors';
import { ErrorNotice } from './components/ErrorNotice';
import { Header } from './components/Header';
import { useContentDraft } from './hooks/useContentDraft';
import { useSettings } from './hooks/useSettings';
import { useWorkflow } from './hooks/useWorkflow';
import { IdlePage } from './pages/IdlePage';
import { ProgressPage } from './pages/ProgressPage';
import { ReadyPage } from './pages/ReadyPage';
import { ReviewPage } from './pages/ReviewPage';
import { SelectedPage } from './pages/SelectedPage';
import { SettingsPage } from './pages/SettingsPage';

const IMAGE_ERRORS = new Set(['INVALID_IMAGE', 'IMAGE_TOO_LARGE', 'IMAGE_MISSING']);
const UPLOAD_ERRORS = new Set(['DRIBBBLE_UNAVAILABLE', 'UPLOAD_FAILED', 'NOT_LOGGED_IN', 'SECURITY_CHALLENGE', 'INTERRUPTED']);

export function App() {
  const { state, send } = useWorkflow();
  const settingsApi = useSettings();
  const [view, setView] = useState<'main' | 'settings'>('main');
  const [localError, setLocalError] = useState<SerializedError | null>(null);
  const [reading, setReading] = useState(false);

  const syncContent = useCallback((content: ShotContent) => send({ type: 'UPDATE_CONTENT', payload: content }), [send]);
  const { draft, update, flush } = useContentDraft(state?.content, state?.contentRevision ?? 0, syncContent);

  // The popup can close at any moment; push unsynced edits immediately.
  useEffect(() => {
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [flush]);

  // Reading finished once the background reports the new image (or an error).
  useEffect(() => {
    setReading(false);
  }, [state?.image?.thumbnailDataUrl, state?.error]);

  const selectFile = async (file: File) => {
    setLocalError(null);
    try {
      const mimeType = await validateImageFile(file);
      setReading(true);
      send({ type: 'SELECT_IMAGE', payload: { dataUrl: await blobToDataUrl(file), fileName: file.name, mimeType } });
    } catch (error) {
      setReading(false);
      setLocalError(serializeError(error, 'INVALID_IMAGE'));
    }
  };

  const regenerate = (field: ShotField) => {
    if (draft) send({ type: 'REGENERATE', payload: { field, current: draft } });
  };

  const upload = () => {
    if (!draft) return;
    flush();
    send({ type: 'START_UPLOAD', payload: draft });
  };

  const openSettings = () => setView('settings');

  if (view === 'settings') {
    return (
      <div className="app">
        <Header title="Settings" onBack={() => setView('main')} />
        <SettingsPage api={settingsApi} />
      </div>
    );
  }

  const error = localError ?? state?.error;
  const providerLabel = getProviderDescriptor(settingsApi.settings.aiProvider).label;

  const page = (() => {
    if (!state) return <main className="page" aria-busy="true" />;
    switch (state.stage) {
      case 'idle':
        return <IdlePage onFile={(f) => void selectFile(f)} busy={reading} />;
      case 'selected':
        return (
          <SelectedPage
            image={state.image!}
            keyConfigured={settingsApi.keyConfigured}
            providerLabel={providerLabel}
            onPrepare={() => send({ type: 'PREPARE_SHOT' })}
            onChangeImage={(f) => void selectFile(f)}
            onOpenSettings={openSettings}
          />
        );
      case 'preparing':
        return (
          <ProgressPage
            title="Preparing your shot"
            subtitle={`${providerLabel} is studying your design.`}
            steps={state.steps}
            image={state.image}
            onCancel={() => send({ type: 'CANCEL' })}
            footnote="You can close this panel — progress is kept."
          />
        );
      case 'review':
        return draft ? (
          <ReviewPage
            image={state.image}
            draft={draft}
            regenerating={state.regenerating}
            onChange={update}
            onRegenerate={regenerate}
            onUpload={upload}
          />
        ) : null;
      case 'uploading':
        return (
          <ProgressPage
            title="Preparing your Dribbble shot..."
            subtitle="Working in the Dribbble tab. Nothing will be published."
            steps={state.steps}
            onCancel={() => send({ type: 'CANCEL' })}
          />
        );
      case 'ready':
        return (
          <ReadyPage
            image={state.image}
            content={state.content}
            result={state.result!}
            onOpenDribbble={() => send({ type: 'OPEN_DRIBBBLE' })}
            onBackToReview={() => send({ type: 'BACK_TO_REVIEW' })}
            onStartOver={() => send({ type: 'RESET' })}
          />
        );
    }
  })();

  const retry = (() => {
    if (!error || !state) return undefined;
    if (state.stage === 'selected' && !IMAGE_ERRORS.has(error.code)) return () => send({ type: 'PREPARE_SHOT' });
    if (state.stage === 'review' && UPLOAD_ERRORS.has(error.code)) return upload;
    return undefined;
  })();

  return (
    <div className="app">
      <Header
        onOpenSettings={openSettings}
      />
      {error && (
        <div style={{ padding: 'var(--space-4) var(--space-4) 0' }}>
          <ErrorNotice
            error={error}
            onDismiss={() => (localError ? setLocalError(null) : send({ type: 'DISMISS_ERROR' }))}
            onOpenSettings={openSettings}
            onRetry={retry}
          />
        </div>
      )}
      {page}
    </div>
  );
}
