// Single source of truth for the workflow. Mirrored to chrome.storage.session
// (memory-only, cleared when the browser closes) so the popup can be closed and
// reopened, and the service worker can restart, without losing progress.

import type { ProgressStep, WorkflowState } from '../types';

const STATE_KEY = 'workflowState';

export const INITIAL_STATE: WorkflowState = { stage: 'idle', steps: [], contentRevision: 0 };

type Listener = (state: WorkflowState) => void;

export class StateStore {
  private state: WorkflowState = INITIAL_STATE;
  private readonly listeners = new Set<Listener>();
  private persistQueue: Promise<void> = Promise.resolve();

  async load(): Promise<WorkflowState> {
    const stored = await chrome.storage.session.get(STATE_KEY);
    const value = stored[STATE_KEY] as WorkflowState | undefined;
    if (value && typeof value.stage === 'string') this.state = { ...INITIAL_STATE, ...value };
    return this.state;
  }

  get(): WorkflowState {
    return this.state;
  }

  set(next: WorkflowState): WorkflowState {
    this.state = next;
    // Serialise writes so an older snapshot can never overwrite a newer one.
    this.persistQueue = this.persistQueue
      .then(() => chrome.storage.session.set({ [STATE_KEY]: next }))
      .catch((error: unknown) => console.error('Failed to persist workflow state', error));
    for (const listener of this.listeners) listener(next);
    return next;
  }

  update(patch: Partial<WorkflowState> | ((state: WorkflowState) => Partial<WorkflowState>)): WorkflowState {
    const changes = typeof patch === 'function' ? patch(this.state) : patch;
    return this.set({ ...this.state, ...changes });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export interface StepDefinition {
  id: string;
  label: string;
  doneLabel: string;
}

export function createSteps(definitions: readonly StepDefinition[]): ProgressStep[] {
  return definitions.map((d) => ({ ...d, status: 'pending' }));
}

/** Marks `id` with `status`; activating a step completes every earlier unfinished step. */
export function setStep(steps: ProgressStep[], id: string, status: ProgressStep['status']): ProgressStep[] {
  const index = steps.findIndex((s) => s.id === id);
  if (index === -1) return steps;
  return steps.map((step, i) => {
    if (i === index) return { ...step, status };
    if (i < index && status !== 'pending' && step.status !== 'done') return { ...step, status: 'done' };
    return step;
  });
}

export function failActiveStep(steps: ProgressStep[]): ProgressStep[] {
  return steps.map((s) => (s.status === 'active' ? { ...s, status: 'error' } : s));
}
