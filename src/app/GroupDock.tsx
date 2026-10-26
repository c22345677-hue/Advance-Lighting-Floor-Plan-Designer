// Groups 1–9 along the bottom of the side panel: tap one to pick the whole group, double-tap
// (or the pencil) to name it, × to break it up. "+" groups what's selected in the next free slot.
import { useState } from 'react';
import type { ItemGroup } from '../model/project';

interface Props {
  groups: ItemGroup[];
  /** Slot whose members are exactly the selection (shown as picked). */
  active: number | null;
  canCreate: boolean;
  onPick: (slot: number) => void;
  onCreate: () => void;
  onRename: (slot: number, name: string) => void;
  onDelete: (slot: number) => void;
}

export function GroupDock({ groups, active, canCreate, onPick, onCreate, onRename, onDelete }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const startEdit = (g: ItemGroup) => {
    setEditing(g.slot);
    setDraft(g.name ?? '');
  };
  const commit = () => {
    if (editing != null) onRename(editing, draft);
    setEditing(null);
  };
  return (
    <div className="group-dock" role="toolbar" aria-label="Groups">
      <span className="group-dock-title">Groups</span>
      <div className="group-chips">
        {groups.map((g) =>
          editing === g.slot ? (
            <input
              key={g.slot}
              className="text-input group-name-input"
              autoFocus
              value={draft}
              placeholder={`Group ${g.slot}`}
              aria-label={`Name group ${g.slot}`}
              onChange={(e) => setDraft(e.target.value)}
              onBlur={commit}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commit();
                if (e.key === 'Escape') setEditing(null);
              }}
            />
          ) : (
            <span key={g.slot} className={`group-chip ${active === g.slot ? 'on' : ''}`}>
              <button
                className="group-pick"
                onClick={() => onPick(g.slot)}
                onDoubleClick={() => startEdit(g)}
                title={`Pick ${g.name ?? `group ${g.slot}`} (${g.ids.length} items) · Shift+${g.slot}. Double-tap to name it.`}
              >
                <span className="group-slot">{g.slot}</span>
                <span className="group-label">{g.name ?? `Group ${g.slot}`}</span>
              </button>
              {active === g.slot && (
                <>
                  <button className="group-mini" onClick={() => startEdit(g)} aria-label={`Rename group ${g.slot}`} title="Name">
                    ✎
                  </button>
                  <button className="group-mini" onClick={() => onDelete(g.slot)} aria-label={`Ungroup ${g.slot}`} title="Ungroup">
                    ×
                  </button>
                </>
              )}
            </span>
          ),
        )}
        <button
          className="group-chip group-add"
          onClick={onCreate}
          disabled={!canCreate || groups.length >= 9}
          title="Group the selection (or select items and press Ctrl + 1–9)"
          aria-label="Group the selection"
        >
          +
        </button>
      </div>
    </div>
  );
}
