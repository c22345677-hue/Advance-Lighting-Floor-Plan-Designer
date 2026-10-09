import { ACTOR_COLORS, KIND_ROLES, ROLE_LABEL, roleOf, type ProjectKind } from '../model/project';
import type { Actor, Gender } from '../model/types';

/** Role, name, gender and colour of a cast member. Changes apply in every scene. */
export function PersonEditor({
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
    <div className="stack">
      <label className="field">
        <span className="field-label">Name</span>
        <input className="text-input" value={actor.name} aria-label="Name" onChange={(e) => onUpdate({ name: e.target.value })} />
      </label>
      {roles.length > 1 && (
        <div className="field">
          <span className="field-label">Role</span>
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
        </div>
      )}
      <div className="field">
        <span className="field-label">Figure</span>
        <div className="segmented" role="radiogroup" aria-label="Gender">
          {(['male', 'female'] as Gender[]).map((g) => (
            <button key={g} role="radio" aria-checked={actor.gender === g} onClick={() => onUpdate({ gender: g })}>
              {g === 'male' ? 'Male' : 'Female'}
            </button>
          ))}
        </div>
      </div>
      <div className="field top">
        <span className="field-label">Colour</span>
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
    </div>
  );
}
