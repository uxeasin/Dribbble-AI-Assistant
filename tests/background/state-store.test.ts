import { describe, expect, it } from 'vitest';
import { createSteps, failActiveStep, setStep } from '../../src/background/state-store';

const steps = createSteps([
  { id: 'a', label: 'A…', doneLabel: 'A' },
  { id: 'b', label: 'B…', doneLabel: 'B' },
  { id: 'c', label: 'C…', doneLabel: 'C' },
]);

describe('progress steps', () => {
  it('completes earlier steps when a later one becomes active', () => {
    expect(setStep(steps, 'c', 'active').map((s) => s.status)).toEqual(['done', 'done', 'active']);
  });

  it('marks the active step as failed', () => {
    expect(failActiveStep(setStep(steps, 'b', 'active')).map((s) => s.status)).toEqual(['done', 'error', 'pending']);
  });

  it('ignores unknown steps', () => {
    expect(setStep(steps, 'zzz', 'done')).toBe(steps);
  });
});
