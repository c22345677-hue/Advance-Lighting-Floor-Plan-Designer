import { useEffect, useRef, type ReactNode } from 'react';
import { IconClose } from './icons';

interface Props {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Optional footer (main action). */
  footer?: ReactNode;
}

/** Centered dialog on wide screens, full-screen sheet on phones. Esc or the backdrop closes it. */
export function Dialog({ title, onClose, children, footer }: Props) {
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    box.current?.focus();
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="dialog-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-label={title} ref={box} tabIndex={-1}>
        <header className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose />
          </button>
        </header>
        <div className="dialog-body">{children}</div>
        {footer && <footer className="dialog-foot">{footer}</footer>}
      </div>
    </div>
  );
}
