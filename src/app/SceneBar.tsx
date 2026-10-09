import { useState } from 'react';
import type { SceneDoc } from '../model/project';

interface Props {
  scenes: SceneDoc[];
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}

/** Scene tabs. Tap the active scene again to rename, duplicate or delete it. */
export function SceneBar({ scenes, activeId, onSelect, onAdd, onRename, onDuplicate, onDelete }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const active = scenes.find((s) => s.id === activeId);

  return (
    <nav className="scenebar" aria-label="Scenes">
      <div className="scene-tabs" role="tablist">
        {scenes.map((s) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={s.id === activeId}
            className="scene-tab"
            onClick={() => (s.id === activeId ? setEditing(editing ? null : s.id) : onSelect(s.id))}
            title={s.id === activeId ? 'Tap to rename, duplicate or delete' : undefined}
          >
            {s.name || 'Untitled'}
          </button>
        ))}
        <button className="scene-add" onClick={onAdd} aria-label="Add scene">
          + Scene
        </button>
      </div>
      {editing && active && (
        <div className="scene-edit">
          <input
            className="text-input"
            value={active.name}
            autoFocus
            aria-label="Scene name"
            onChange={(e) => onRename(active.id, e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && setEditing(null)}
          />
          <button
            onClick={() => {
              onDuplicate(active.id);
              setEditing(null);
            }}
          >
            Duplicate
          </button>
          <button
            className="danger"
            disabled={scenes.length < 2}
            onClick={() => {
              if (window.confirm(`Delete ${active.name}?`)) {
                onDelete(active.id);
                setEditing(null);
              }
            }}
          >
            Delete
          </button>
          <button onClick={() => setEditing(null)}>Done</button>
        </div>
      )}
    </nav>
  );
}
