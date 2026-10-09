import { ACTOR_COLORS, KIND_ROLES, ROLE_LABEL, roleOf, type ProjectKind } from '../model/project';
import type { Actor, CastRole, Gender } from '../model/types';

interface Props {
  kind: ProjectKind;
  actors: Actor[];
  /** Actor ids placed in the current scene. */
  placed: Set<string>;
  onAdd: (role: CastRole) => void;
  onUpdate: (id: string, patch: Partial<Omit<Actor, 'id'>>) => void;
  onDelete: (id: string) => void;
  onPlace: (id: string) => void;
}

/** The project's cast. Shared by every scene; each scene places the actors it needs. */
export function ActorsPanel({ kind, actors, placed, onAdd, onUpdate, onDelete, onPlace }: Props) {
  return (
    <div className="panel-body">
      <p className="muted small">
        {kind === 'doc' ? 'Interviewees and interviewers' : 'Actors'} belong to the whole project and keep their name, colour and look in every scene.
      </p>
      {actors.map((a) => (
        <div key={a.id} className="actor-row">
          <ActorEditor actor={a} kind={kind} onUpdate={(patch) => onUpdate(a.id, patch)} />
          <div className="btn-row">
            <button className={placed.has(a.id) ? 'on' : ''} onClick={() => onPlace(a.id)}>
              {placed.has(a.id) ? 'In scene · select' : 'Place in scene'}
            </button>
            <DeleteActor name={a.name} onDelete={() => onDelete(a.id)} />
          </div>
        </div>
      ))}
      <div className="btn-row">
        {KIND_ROLES[kind].map((r) => (
          <button key={r} className="primary" onClick={() => onAdd(r)}>
            + New {ROLE_LABEL[r].toLowerCase()}
          </button>
        ))}
      </div>
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

/** Name, role, gender and colour. Used in the cast list and the inspector. */
export function ActorEditor({
  actor,
  kind,
  onUpdate,
}: {
  actor: Actor;
  kind: ProjectKind;
  onUpdate: (patch: Partial<Omit<Actor, 'id'>>) => void;
}) {
  const role = roleOf(actor);
  const roles = KIND_ROLES[kind].includes(role) ? KIND_ROLES[kind] : [role, ...KIND_ROLES[kind]];
  return (
    <div className="actor-editor">
      {roles.length > 1 && (
        <div className="segmented" role="radiogroup" aria-label="Role">
          {roles.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={role === r}
              onClick={() =>
                // A default name ("Interviewee 2") follows the role; a real name stays.
                onUpdate({
                  role: r,
                  ...(actor.name.startsWith(ROLE_LABEL[role]) ? { name: actor.name.replace(ROLE_LABEL[role], ROLE_LABEL[r]) } : {}),
                })
              }
            >
              {ROLE_LABEL[r]}
            </button>
          ))}
        </div>
      )}
      <input
        className="text-input"
        value={actor.name}
        aria-label="Name"
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
