import { useCallback, useEffect, useRef, useState } from 'react';
import type { ShotContent } from '../../types';

const SYNC_DELAY_MS = 400;

/**
 * Local editable copy of the generated content. When the AI replaces content
 * (a new revision), fields the AI changed are taken from the background while
 * the designer's unsynced edits to other fields are kept.
 */
export function useContentDraft(
  content: ShotContent | undefined,
  revision: number,
  sync: (content: ShotContent) => void,
) {
  const [draft, setDraft] = useState<ShotContent | undefined>(content);
  const base = useRef<ShotContent | undefined>(content);
  const seenRevision = useRef(revision);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef(draft);
  latest.current = draft;

  useEffect(() => {
    if (!content) return;
    if (!draft || revision !== seenRevision.current) {
      const previous = base.current;
      setDraft((current) => {
        if (!current || !previous) return content;
        const merged = { ...current };
        for (const key of Object.keys(content) as (keyof ShotContent)[]) {
          if (JSON.stringify(content[key]) !== JSON.stringify(previous[key])) {
            Object.assign(merged, { [key]: content[key] });
          }
        }
        return merged;
      });
      seenRevision.current = revision;
    }
    base.current = content;
  }, [content, revision]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (latest.current) sync(latest.current);
  }, [sync]);

  const update = useCallback(
    (patch: Partial<ShotContent>) => {
      setDraft((current) => {
        if (!current) return current;
        const next = { ...current, ...patch };
        clearTimeout(timer.current);
        timer.current = setTimeout(() => sync(next), SYNC_DELAY_MS);
        return next;
      });
    },
    [sync],
  );

  useEffect(() => () => flush(), [flush]);

  return { draft, update, flush };
}
