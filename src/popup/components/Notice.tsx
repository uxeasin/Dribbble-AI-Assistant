import type { ReactNode } from 'react';
import { IconButton } from './Button';
import { Icon, type IconName } from './Icon';

interface NoticeProps {
  tone: 'error' | 'warning' | 'info' | 'success';
  children: ReactNode;
  actions?: ReactNode;
  onDismiss?: () => void;
  icon?: IconName;
}

export function Notice({ tone, children, actions, onDismiss, icon }: NoticeProps) {
  const iconName = icon ?? (tone === 'success' ? 'check' : tone === 'info' ? 'lock' : 'alert');
  return (
    <div className={`notice notice--${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon name={iconName} className="notice__icon" />
      <div className="notice__body">
        <div className="notice__message">{children}</div>
        {actions && <div className="notice__actions">{actions}</div>}
      </div>
      {onDismiss && <IconButton icon="close" label="Dismiss" size="sm" onClick={onDismiss} />}
    </div>
  );
}
