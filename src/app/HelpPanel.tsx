// Help dialog: every keyboard shortcut and mouse control, grouped by what it's for.
import { Fragment, type ReactNode } from 'react';

const isMac = typeof navigator !== 'undefined' && /Mac|iPad|iPhone/.test(navigator.platform);
const MOD = isMac ? '⌘' : 'Ctrl';

const k = (...keys: string[]) =>
  keys.map((key, i) => (
    <Fragment key={i}>
      {i > 0 && ' + '}
      <kbd>{key}</kbd>
    </Fragment>
  ));

const GROUPS: { title: string; rows: [ReactNode, string][] }[] = [
  {
    title: 'Tools and categories',
    rows: [
      [k('W'), 'Move tool: select and drag'],
      [k('R'), 'Rotate tool: select and turn'],
      [<>{k('1')} – {k('4')}</>, 'Lights, Grip, Camera, Scene'],
      [k('?'), 'This help'],
    ],
  },
  {
    title: 'Selecting',
    rows: [
      ['Click', 'Select an item of the current category'],
      ['Drag on empty space', 'Box-select (only the current category)'],
      [<>{k('Shift')} + click</>, 'Add to or remove from the selection'],
      [<>{k('Shift')} + box</>, 'Add to the selection'],
      [k(MOD, 'A'), 'Select everything in the current category'],
      [k('Esc'), 'Deselect'],
    ],
  },
  {
    title: 'Editing',
    rows: [
      ['Drag a selected item', 'Move the whole selection'],
      [k(MOD, 'Z'), 'Undo'],
      [<>{k(MOD, 'Y')} or {k(MOD, 'Shift', 'Z')}</>, 'Redo'],
      [k(MOD, 'D'), 'Duplicate the selection'],
      [<>{k('Alt')} + drag</>, 'Drop a copy, leave the originals in place'],
      [<>{k('Delete')} or {k('Backspace')}</>, 'Delete the selection'],
      [<>{k('Shift')} while rotating</>, 'Turn in 45° steps (otherwise 5°)'],
    ],
  },
  {
    title: 'View',
    rows: [
      ['Middle mouse drag', 'Pan'],
      [<>{k('Space')} + drag</>, 'Pan'],
      ['Mouse wheel', 'Zoom'],
      ['Two fingers', 'Pan and zoom (touch)'],
      ['Shadow button (bottom right)', 'Show or hide the shadows the lights cast'],
    ],
  },
  {
    title: 'Touch screens',
    rows: [
      ['Tap', 'Select an item of the current category'],
      ['Hold a finger on an item', 'Add it to the selection, or take it out'],
      ['Drag a selected item', 'Move the whole selection'],
      ['Bar above the plan', 'Turn 15°, duplicate, delete or deselect the selection'],
      ['Two fingers', 'Pan and zoom'],
      ['Double-tap or Finish', 'End the walls being drawn'],
    ],
  },
  {
    title: 'Draw walls',
    rows: [
      ['Click', 'Place a corner'],
      ['Click the first corner', 'Close the room'],
      ['Click the end of an open wall', 'Continue that wall'],
      ['Click on a wall', 'Add a corner to it'],
      [<>Double-click, right-click or {k('Enter')}</>, 'End open walls, start another'],
      ['Right-click with nothing drawn', 'Leave the tool'],
      [k('Esc'), 'Cancel the wall being drawn, then leave the tool'],
      [<>Hold {k(MOD)}</>, 'No snapping while held'],
      [<>Hold {k('Shift')}</>, 'Angles in 15° steps'],
    ],
  },
];

export function HelpPanel() {
  return (
    <div>
      {GROUPS.map((g) => (
        <section key={g.title} className="keys-group">
          <h3 className="section-title">{g.title}</h3>
          <table className="keys">
            <tbody>
              {g.rows.map(([keys, what], i) => (
                <tr key={i}>
                  <td>{keys}</td>
                  <td>{what}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}
