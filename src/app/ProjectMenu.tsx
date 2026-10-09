import { useState } from 'react';
import type { Project } from '../model/project';
import { listProjects } from './storage';

interface Props {
  project: Project;
  onRename: (name: string) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: () => void;
}

/** Project name in the top bar; opens a menu to rename, switch, create or delete projects. */
export function ProjectMenu({ project, onRename, onOpen, onNew, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const others = open ? listProjects().filter((m) => m.id !== project.id) : [];

  return (
    <div className="project-menu">
      <button className="project-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {project.name || 'Untitled project'} ▾
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Project">
          <label className="field">
            <span className="field-label">Project</span>
            <input className="text-input" value={project.name} onChange={(e) => onRename(e.target.value)} />
          </label>
          {others.length > 0 && (
            <>
              <h4 className="pop-head">Open</h4>
              <ul className="project-list">
                {others.map((m) => (
                  <li key={m.id}>
                    <button
                      onClick={() => {
                        onOpen(m.id);
                        setOpen(false);
                      }}
                    >
                      {m.name || 'Untitled project'}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="btn-row">
            <button
              className="primary"
              onClick={() => {
                onNew();
                setOpen(false);
              }}
            >
              New project
            </button>
            <button
              className="danger"
              onClick={() => {
                if (window.confirm(`Delete "${project.name}" from this device?`)) {
                  onDelete();
                  setOpen(false);
                }
              }}
            >
              Delete
            </button>
            <button onClick={() => setOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
