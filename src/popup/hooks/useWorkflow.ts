import { useCallback, useEffect, useRef, useState } from 'react';
import { WORKFLOW_PORT, type BackgroundEvent, type PopupCommand } from '../../messaging/messages';
import type { WorkflowState } from '../../types';

/**
 * Connects to the background workflow over a long-lived port. The background
 * owns all state, so closing and reopening the popup resumes where it left off.
 */
export function useWorkflow() {
  const [state, setState] = useState<WorkflowState | null>(null);
  const portRef = useRef<chrome.runtime.Port | null>(null);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      const port = chrome.runtime.connect({ name: WORKFLOW_PORT });
      portRef.current = port;
      port.onMessage.addListener((event: BackgroundEvent) => {
        if (event.type === 'STATE_UPDATED') setState(event.payload);
      });
      // The service worker can be restarted by the browser; reconnect transparently.
      port.onDisconnect.addListener(() => {
        portRef.current = null;
        if (!disposed) retry = setTimeout(connect, 150);
      });
    };
    connect();

    return () => {
      disposed = true;
      clearTimeout(retry);
      portRef.current?.disconnect();
    };
  }, []);

  const send = useCallback((command: PopupCommand) => {
    portRef.current?.postMessage(command);
  }, []);

  return { state, send };
}
