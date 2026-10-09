import { useState } from 'react';
import type { SceneDoc } from '../model/project';
import { IconMore } from './icons';

interface Props {
  scenes: SceneDoc[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onClear: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Scene tabs. The active scene's "⋯" opens its actions: rename, duplicate, clear, delete. */
export function SceneBar({ scenes, activeId, onSelect, onAdd, onRename, onDuplicate, onClear, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const active = scenes.find((s) => s.id === activeId);
  const isEmpty = !active || active.items.length + active.setItems.length === 0;

  return (
    <nav className="scenebar" aria-label="Scenes">
      <div className="scene-tabs" role="tablist">
        {scenes.map((s) => {
          const on = s.id === activeId;
          return (
            <div key={s.id} className={`scene-tab ${on ? 'on' : ''}`}>
              <button
                role="tab"
                aria-selected={on}
                onClick={() => {
                  onSelect(s.id);
                  setOpen(false);
                }}
              >
                {s.name || 'Untitled'}
              </button>
              {on && (
                <button className="scene-more" aria-label={`${s.name} actions`} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
                  <IconMore />
                </button>
              )}
            </div>
          );
        })}
        <button className="scene-add" onClick={onAdd}>
          + Scene
        </button>
      </div>
      {open && active && (
        <div className="scene-edit">
          <label className="inline">
            <span className="field-label">Name</span>
            <input
              className="text-input"
              value={active.name}
              autoFocus
              aria-label="Scene name"
              onChange={(e) => onRename(active.id, e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && setOpen(false)}
            />
          </label>
          <button
            className="btn"
            onClick={() => {
              onDuplicate(active.id);
              setOpen(false);
            }}
          >
            Duplicate scene
          </button>
          <button
            className="btn"
            disabled={isEmpty}
            onClick={() => window.confirm(`Remove everything from ${active.name}? (Undo can bring it back.)`) && onClear(active.id)}
          >
            Clear scene
          </button>
          <button
            className="btn danger"
            disabled={scenes.length < 2}
            onClick={() => {
              if (window.confirm(`Delete ${active.name}?`)) {
                onDelete(active.id);
                setOpen(false);
              }
            }}
          >
            Delete scene
          </button>
          <button className="btn" onClick={() => setOpen(false)}>
            Done
          </button>
        </div>
      )}
    </nav>
  );
}
