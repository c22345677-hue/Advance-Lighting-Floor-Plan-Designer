// Groups 1–9 along the bottom of the side panel: tap one to pick the whole group, double-tap
// (or the pencil) to name it, × to break it up. "+" groups what's selected in the next free slot.
import { useState } from 'react';
import { GROUP_COLORS, groupColor, type ItemGroup } from '../model/project';

interface Props {
  groups: ItemGroup[];
  /** Slot whose members are exactly the selection (shown as picked). */
  active: number | null;
  canCreate: boolean;
  onPick: (slot: number) => void;
  onCreate: () => void;
  onRename: (slot: number, name: string) => void;
  onColor: (slot: number, color: string) => void;
  onDelete: (slot: number) => void;
}

export function GroupDock({ groups, active, canCreate, onPick, onCreate, onRename, onColor, onDelete }: Props) {
  const [editing, setEditing] = useState<number | null>(null);
  /** Group whose colour is being picked. */
  const [coloring, setColoring] = useState<number | null>(null);
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
            <span key={g.slot} className={`group-chip ${active === g.slot ? 'on' : ''}`} style={{ '--grp': groupColor(g) } as React.CSSProperties}>
              <button
                className="group-pick"
                onClick={() => onPick(g.slot)}
                onDoubleClick={() => startEdit(g)}
                title={`Pick ${g.name ?? `group ${g.slot}`} (${g.ids.length} items) · Shift+${g.slot}. Double-tap to name it.`}
              >
                <span className="group-slot">{g.slot}</span>
                <span className="group-label">{g.name ?? `Group ${g.slot}`}</span>
                {/* Inside other groups: their numbers. */}
                {groups.some((o) => o.slot !== g.slot && o.ids.length > g.ids.length && g.ids.every((id) => o.ids.includes(id))) && (
                  <span className="group-in" title="Inside these groups">
                    ⊂{groups.filter((o) => o.slot !== g.slot && o.ids.length > g.ids.length && g.ids.every((id) => o.ids.includes(id))).map((o) => o.slot).join(',')}
                  </span>
                )}
              </button>
              {active === g.slot && (
                <>
                  <button className="group-mini" onClick={() => startEdit(g)} aria-label={`Rename group ${g.slot}`} title="Name">
                    ✎
                  </button>
                  <button className="group-mini" onClick={() => setColoring(coloring === g.slot ? null : g.slot)} aria-label={`Colour of group ${g.slot}`} title="Colour">
                    <span className="group-dot" />
                  </button>
                  <button className="group-mini" onClick={() => onDelete(g.slot)} aria-label={`Ungroup ${g.slot}`} title="Ungroup">
                    ×
                  </button>
                </>
              )}
            </span>
          ),
        )}
        {coloring != null && groups.some((g) => g.slot === coloring) && (
          <span className="group-colors" role="radiogroup" aria-label={`Colour of group ${coloring}`}>
            {GROUP_COLORS.map((c) => (
              <button
                key={c}
                role="radio"
                aria-checked={groupColor(groups.find((g) => g.slot === coloring)!) === c}
                className="swatch-btn"
                style={{ background: c }}
                aria-label={`Colour ${c}`}
                onClick={() => {
                  onColor(coloring, c);
                  setColoring(null);
                }}
              />
            ))}
          </span>
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
