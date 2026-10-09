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
    title: 'Editing',
    rows: [
      [k(MOD, 'Z'), 'Undo'],
      [<>{k(MOD, 'Y')} or {k(MOD, 'Shift', 'Z')}</>, 'Redo'],
      [k(MOD, 'D'), 'Duplicate the selected item'],
      [<>{k('Alt')} + drag</>, 'Drop a copy, leave the original in place'],
      [<>{k('Delete')} or {k('Backspace')}</>, 'Delete the selected item'],
      [k('Esc'), 'Deselect'],
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
