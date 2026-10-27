import { useEffect, useState } from 'react';
import { canPickFolder, chooseExportFolder, clearExportFolder, exportFolder, fileBase, fileName, type ExportOptions } from './exportImage';

interface Props {
  projectName: string;
  sceneName: string;
  options: ExportOptions;
  onProjectName: (name: string) => void;
  onSceneName: (name: string) => void;
  onOptions: (o: ExportOptions) => void;
}

/** JPEG export settings: the names that make up the file name, where it goes, what it shows. */
export function ExportPanel({ projectName, sceneName, options, onProjectName, onSceneName, onOptions }: Props) {
  const [folder, setFolder] = useState<string | null>(null);
  useEffect(() => {
    void exportFolder().then((h) => setFolder(h?.name ?? null));
  }, []);
  const set = (patch: Partial<ExportOptions>) => onOptions({ ...options, ...patch });

  return (
    <div className="export-panel">
      <label className="field">
        <span className="field-label">Project</span>
        <input id="export-project" className="text-input" value={projectName} placeholder="Untitled project" onChange={(e) => onProjectName(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Scene</span>
        <input id="export-scene" className="text-input" value={sceneName} onChange={(e) => onSceneName(e.target.value)} />
      </label>
      <p className="muted export-name">
        File name: <strong>{fileName(fileBase(projectName, sceneName), 1)}</strong>
        <br />
        The number goes up with each export, so nothing is overwritten.
      </p>

      <div className="field">
        <span className="field-label">Folder</span>
        {canPickFolder() ? (
          <div className="export-folder">
            <span id="export-folder-name">{folder ?? 'Downloads'}</span>
            <button className="btn" onClick={() => void chooseExportFolder().then((h) => h && setFolder(h.name))}>
              Choose…
            </button>
            {folder && (
              <button
                className="btn"
                onClick={() => {
                  void clearExportFolder();
                  setFolder(null);
                }}
              >
                Use Downloads
              </button>
            )}
          </div>
        ) : (
          <span className="muted">Downloads (this browser can't save into a chosen folder)</span>
        )}
      </div>

      <div className="field">
        <span className="field-label">Shows</span>
        <div className="segmented" role="radiogroup" aria-label="Export area">
          <button id="export-area-plan" role="radio" aria-checked={options.area === 'plan'} onClick={() => set({ area: 'plan' })}>
            Whole plan
          </button>
          <button id="export-area-view" role="radio" aria-checked={options.area === 'view'} onClick={() => set({ area: 'view' })}>
            What's on screen
          </button>
        </div>
      </div>
      <div className="field">
        <span className="field-label">Quality</span>
        <div className="segmented" role="radiogroup" aria-label="Export quality">
          <button id="export-quality-standard" role="radio" aria-checked={options.quality === 'standard'} onClick={() => set({ quality: 'standard' })}>
            Standard
          </button>
          <button id="export-quality-high" role="radio" aria-checked={options.quality === 'high'} onClick={() => set({ quality: 'high' })}>
            High (print)
          </button>
        </div>
      </div>
      <label className="field toggle">
        <span className="field-label">Title on image</span>
        <input id="export-title" type="checkbox" checked={options.title} onChange={(e) => set({ title: e.target.checked })} />
      </label>
    </div>
  );
}
