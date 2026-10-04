import { IconButton } from './Button';
import { Icon } from './Icon';

interface HeaderProps {
  title?: string;
  onBack?: () => void;
  onOpenSettings?: () => void;
}

export function Header({ title = 'Dribbble AI Assistant', onBack, onOpenSettings }: HeaderProps) {
  return (
    <header className="header">
      {onBack && <IconButton icon="back" label="Back" onClick={onBack} />}
      <div className="header__brand">
        {!onBack && (
          <span className="logo" aria-hidden="true">
            <Icon name="sparkles" size={15} />
          </span>
        )}
        <h1 className="header__title" style={{ fontSize: 'inherit' }}>
          {title}
        </h1>
      </div>
      <div className="header__actions">
        {onOpenSettings && <IconButton icon="settings" label="Settings" onClick={onOpenSettings} />}
      </div>
    </header>
  );
}
