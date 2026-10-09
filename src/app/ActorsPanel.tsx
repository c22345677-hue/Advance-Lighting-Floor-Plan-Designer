import { ACTOR_COLORS } from '../model/project';
import type { Actor, Gender } from '../model/types';

interface Props {
  actors: Actor[];
  /** Actor ids placed in the current scene. */
  placed: Set<string>;
  onAdd: () => void;
  onUpdate: (id: string, patch: Partial<Omit<Actor, 'id'>>) => void;
  onDelete: (id: string) => void;
  onPlace: (id: string) => void;
}

/** The project's cast. Shared by every scene; each scene places the actors it needs. */
export function ActorsPanel({ actors, placed, onAdd, onUpdate, onDelete, onPlace }: Props) {
  return (
    <div className="panel-body">
      <p className="muted small">Actors belong to the whole project and keep their name and colour in every scene.</p>
      {actors.map((a) => (
        <div key={a.id} className="actor-row">
          <ActorEditor actor={a} onUpdate={(patch) => onUpdate(a.id, patch)} />
          <div className="btn-row">
            <button className={placed.has(a.id) ? 'on' : ''} onClick={() => onPlace(a.id)}>
              {placed.has(a.id) ? 'In scene · select' : 'Place in scene'}
            </button>
            <DeleteActor name={a.name} onDelete={() => onDelete(a.id)} />
          </div>
        </div>
      ))}
      <button className="primary" onClick={onAdd}>
        + New actor
      </button>
    </div>
  );
}

function DeleteActor({ name, onDelete }: { name: string; onDelete: () => void }) {
  return (
    <button
      className="danger"
      onClick={() => {
        if (window.confirm(`Remove ${name} from the project? They will be taken out of every scene.`)) onDelete();
      }}
    >
      Remove
    </button>
  );
}

/** Name, gender and colour. Used in the actors list and the inspector. */
export function ActorEditor({ actor, onUpdate }: { actor: Actor; onUpdate: (patch: Partial<Omit<Actor, 'id'>>) => void }) {
  return (
    <div className="actor-editor">
      <input
        className="text-input"
        value={actor.name}
        aria-label="Actor name"
        onChange={(e) => onUpdate({ name: e.target.value })}
      />
      <div className="segmented" role="radiogroup" aria-label="Gender">
        {(['male', 'female'] as Gender[]).map((g) => (
          <button key={g} role="radio" aria-checked={actor.gender === g} onClick={() => onUpdate({ gender: g })}>
            {g === 'male' ? 'Male' : 'Female'}
          </button>
        ))}
      </div>
      <div className="swatches" role="radiogroup" aria-label="Colour">
        {ACTOR_COLORS.map((c) => (
          <button
            key={c}
            role="radio"
            aria-checked={actor.color === c}
            aria-label={c}
            className="swatch"
            style={{ background: c }}
            onClick={() => onUpdate({ color: c })}
          />
        ))}
        <label className="swatch custom" title="Custom colour">
          <input type="color" value={actor.color} onChange={(e) => onUpdate({ color: e.target.value })} aria-label="Custom colour" />
        </label>
      </div>
    </div>
  );
}
