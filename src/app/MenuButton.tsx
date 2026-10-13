// A top-bar button that opens a short list of actions (the reports and exports).
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { IconChevron } from './icons';

export interface MenuEntry {
  id: string;
  icon: ReactNode;
  label: string;
  hint?: string;
  disabled?: boolean;
  /** Shown as switched on (e.g. a gear list limiting the picks). */
  on?: boolean;
  onClick: () => void;
}

export function MenuButton({ id, icon, label, title, entries }: { id: string; icon: ReactNode; label: string; title: string; entries: MenuEntry[] }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const out = (e: PointerEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('pointerdown', out);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('pointerdown', out);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <div className="menu-wrap" ref={box}>
      <button id={id} className={`top-action ${entries.some((e) => e.on) ? 'on' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)} title={title}>
        {icon} <span className="lbl">{label}</span>
        <span className="menu-caret">
          <IconChevron />
        </span>
      </button>
      {open && (
        <div className="menu-pop" role="menu" aria-label={label}>
          {entries.map((e) => (
            <button
              key={e.id}
              id={e.id}
              role="menuitem"
              className={`menu-item ${e.on ? 'on' : ''}`}
              disabled={e.disabled}
              onClick={() => {
                setOpen(false);
                e.onClick();
              }}
            >
              {e.icon}
              <span className="menu-text">
                <span>{e.label}</span>
                {e.hint && <span className="menu-hint">{e.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
