// Arrange a selection: line up, space evenly, arc around or face a person.
import { useState } from 'react';
import { arcAround, faceTowards, lineUp, spaceEvenly, type Patch } from '../model/arrange';
import type { Actor, Item } from '../model/types';

export function ArrangeTools({ items, scene, actors, onPatches }: { items: Item[]; scene: Item[]; actors: Actor[]; onPatches: (p: Patch[]) => void }) {
  const people = scene.filter((i) => i.actorId && !items.includes(i));
  const [target, setTarget] = useState(people[0]?.id ?? '');
  const person = people.find((p) => p.id === target) ?? people[0];
  const name = (i: Item) => actors.find((a) => a.id === i.actorId)?.name ?? 'Person';
  return (
    <>
      <h3 className="section-title">Arrange</h3>
      <div className="btn-row">
        <button className="btn" onClick={() => onPatches(lineUp(items, 'across'))}>
          Line up across
        </button>
        <button className="btn" onClick={() => onPatches(lineUp(items, 'down'))}>
          Line up down
        </button>
        <button className="btn" disabled={items.length < 3} onClick={() => onPatches(spaceEvenly(items))}>
          Space evenly
        </button>
      </div>
      {person ? (
        <>
          <label className="field">
            <span className="field-label">Around</span>
            <select aria-label="Arrange around" value={person.id} onChange={(e) => setTarget(e.target.value)}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {name(p)}
                </option>
              ))}
            </select>
          </label>
          <div className="btn-row">
            <button className="btn" onClick={() => onPatches(arcAround(items, person.pos))}>
              Arc around
            </button>
            <button className="btn" onClick={() => onPatches(faceTowards(items, person.pos))}>
              Face them
            </button>
          </div>
          <p className="hint-text">Arc around puts them on a curve at their average distance, evenly spread and turned to face {name(person)}.</p>
        </>
      ) : (
        <p className="hint-text">Place a person in the scene to arc lights around them.</p>
      )}
    </>
  );
}
