import { useEffect, useRef, useState } from 'react';
import type { Project, ProjectKind, SceneDoc } from '../model/project';
import { IconChevron } from './icons';
import { listProjects } from './storage';

interface Props {
  project: Project;
  scene: SceneDoc;
  onRename: (name: string) => void;
  onKind: (kind: ProjectKind) => void;
  onOpen: (id: string) => void;
  onNew: () => void;
  onDelete: () => void;
  onSelectScene: (id: string) => void;
  onAddScene: () => void;
  onRenameScene: (id: string, name: string) => void;
  onDuplicateScene: (id: string) => void;
  onClearScene: (id: string) => void;
  onDeleteScene: (id: string) => void;
}

/**
 * "Project › Scene" in the top bar. Its menu holds the scenes (switch, add, rename, duplicate,
 * clear, delete), the project's settings and the other projects.
 */
export function ProjectMenu(props: Props) {
  const { project, scene, onRename, onKind, onOpen, onNew, onDelete } = props;
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const others = open ? listProjects().filter((m) => m.id !== project.id) : [];
  const kind = project.kind ?? 'narrative';
  const isEmpty = scene.items.length + scene.setItems.length === 0;
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const outside = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', outside);
    window.addEventListener('keydown', esc);
    return () => {
      window.removeEventListener('mousedown', outside);
      window.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="project-menu" ref={box}>
      <button
        id="project-btn"
        className="project-btn"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Scenes, project settings and other projects"
      >
        <span className="project-name">{project.name || 'Untitled project'}</span>
        <span className="crumb-sep" aria-hidden="true">
          ›
        </span>
        <span className="scene-name">{scene.name || 'Untitled scene'}</span>
        <IconChevron />
      </button>

      {open && (
        <div className="popover" role="dialog" aria-label="Project and scenes">
          <section className="section">
            <h3 className="section-title">
              Scenes<span className="count">{project.scenes.length}</span>
            </h3>
            <ul className="row-list scroll short">
              {project.scenes.map((s) => {
                const on = s.id === scene.id;
                const n = s.items.length + s.setItems.length;
                return (
                  <li key={s.id}>
                    <button
                      className={`row ${on ? 'current' : ''}`}
                      aria-current={on}
                      onClick={() => {
                        props.onSelectScene(s.id);
                        if (!on) close();
                      }}
                    >
                      <span className="row-main">
                        <span className="row-title">{s.name || 'Untitled scene'}</span>
                        <span className="row-sub">{n === 1 ? '1 item' : `${n} items`}</span>
                      </span>
                      {on && <span className="row-meta accent">Current</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <button id="add-scene" className="btn" onClick={props.onAddScene}>
              + Add scene
            </button>
          </section>

          <section className="section">
            <h3 className="section-title">Current scene</h3>
            <label className="field">
              <span className="field-label">Name</span>
              <input
                className="text-input"
                aria-label="Scene name"
                value={scene.name}
                onChange={(e) => props.onRenameScene(scene.id, e.target.value)}
              />
            </label>
            <div className="btn-row">
              <button className="btn" onClick={() => props.onDuplicateScene(scene.id)}>
                Duplicate
              </button>
              <button
                className="btn"
                disabled={isEmpty}
                onClick={() =>
                  window.confirm(`Remove everything from ${scene.name}? (Undo can bring it back.)`) && props.onClearScene(scene.id)
                }
              >
                Clear
              </button>
              <button
                className="btn danger"
                disabled={project.scenes.length < 2}
                onClick={() => window.confirm(`Delete ${scene.name}?`) && props.onDeleteScene(scene.id)}
              >
                Delete
              </button>
            </div>
          </section>

          <section className="section">
            <h3 className="section-title">Project</h3>
            <label className="field">
              <span className="field-label">Name</span>
              <input className="text-input" aria-label="Project name" value={project.name} onChange={(e) => onRename(e.target.value)} />
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
            <div className="btn-row">
              <button
                className="btn primary"
                onClick={() => {
                  onNew();
                  close();
                }}
              >
                New project
              </button>
              <button
                className="btn danger"
                onClick={() => {
                  if (window.confirm(`Delete "${project.name}" from this device?`)) {
                    onDelete();
                    close();
                  }
                }}
              >
                Delete project
              </button>
            </div>
          </section>

          {others.length > 0 && (
            <section className="section">
              <h3 className="section-title">Open another project</h3>
              <ul className="row-list scroll short">
                {others.map((m) => (
                  <li key={m.id}>
                    <button
                      className="row"
                      onClick={() => {
                        onOpen(m.id);
                        close();
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

          <p className="hint-text">Projects are saved on this device. Google Drive sync comes later.</p>
        </div>
      )}
    </div>
  );
}
