import type { ProgressStep } from '../../types';
import { Icon } from './Icon';

export function ProgressSteps({ steps, label }: { steps: ProgressStep[]; label: string }) {
  const done = steps.filter((s) => s.status === 'done').length;
  const active = steps.some((s) => s.status === 'active') ? 0.5 : 0;
  const percent = steps.length ? Math.round(((done + active) / steps.length) * 100) : 0;

  return (
    <div className="stack">
      <div
        className="progress-bar"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
      >
        <div className="progress-bar__fill" style={{ width: `${percent}%` }} />
      </div>
      <ol className="steps" aria-live="polite">
        {steps.map((step) => (
          <li key={step.id} className={`step step--${step.status}`} aria-current={step.status === 'active' ? 'step' : undefined}>
            <span className="step__indicator" aria-hidden="true">
              {step.status === 'done' && <Icon name="check" size={12} strokeWidth={3} />}
              {step.status === 'error' && <Icon name="close" size={11} strokeWidth={3} />}
            </span>
            <span>{step.status === 'done' ? step.doneLabel : step.label}</span>
            <span className="sr-only">
              {{ pending: '(waiting)', active: '(in progress)', done: '(done)', error: '(failed)' }[step.status]}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
