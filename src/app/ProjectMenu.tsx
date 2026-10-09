import { useEffect, useRef, useState } from 'react';
import type { Project, ProjectKind } from '../model/project';
import { IconChevron } from './icons';
import { listProjects } from './storage';

interface Props {
  project: Project;
  onRename: (name: string) => void;
  onKind: (kind: ProjectKind) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: () => void;
}

/** Project name in the top bar; its menu holds the project's settings and the other projects. */
export function ProjectMenu({ project, onRename, onKind, onOpen, onNew, onDelete }: Props) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const others = open ? listProjects().filter((m) => m.id !== project.id) : [];
  const kind = project.kind ?? 'narrative';

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="project-menu" ref={box}>
      <button className="project-btn" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Project settings and other projects">
        <span className="project-name">{project.name || 'Untitled project'}</span>
        <IconChevron />
      </button>
      {open && (
        <div className="popover" role="dialog" aria-label="Project">
          <section className="section">
            <h3 className="section-title">This project</h3>
            <label className="field">
              <span className="field-label">Name</span>
              <input className="text-input" value={project.name} onChange={(e) => onRename(e.target.value)} />
            </label>
            <div className="field">
              <span className="field-label">Production</span>
              <div className="segmented" role="radiogroup" aria-label="Production type">
                {(['narrative', 'doc'] as ProjectKind[]).map((k) => (
                  <button key={k} role="radio" aria-checked={kind === k} onClick={() => onKind(k)}>
                    {k === 'doc' ? 'Doc' : 'Narrative'}
                  </button>
                ))}
              </div>
            </div>
          </section>

          {others.length > 0 && (
            <section className="section">
              <h3 className="section-title">Open another</h3>
              <ul className="row-list scroll short">
                {others.map((m) => (
                  <li key={m.id}>
                    <button
                      className="row"
                      onClick={() => {
                        onOpen(m.id);
                        setOpen(false);
                      }}
                    >
                      <span className="row-main">
                        <span className="row-title">{m.name || 'Untitled project'}</span>
                        <span className="row-sub">Edited {new Date(m.updated).toLocaleDateString()}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="btn-row">
            <button
              className="btn primary"
              onClick={() => {
                onNew();
                setOpen(false);
              }}
            >
              New project
            </button>
            <button
              className="btn danger"
              onClick={() => {
                if (window.confirm(`Delete "${project.name}" from this device?`)) {
                  onDelete();
                  setOpen(false);
                }
              }}
            >
              Delete project
            </button>
          </div>
          <p className="hint-text">Projects are saved on this device. Google Drive sync comes later.</p>
        </div>
      )}
    </div>
  );
}
