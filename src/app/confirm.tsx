// In-app "Are you sure?" dialog. The browser's window.confirm is blocked in sandboxed frames
// (such as the shared test link) and looks out of place on tablets, so everything uses this.
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';

export interface ConfirmOptions {
  title: string;
  message?: string;
  /** Label of the confirming button, e.g. "Delete project". */
  confirm: string;
  danger?: boolean;
}

type Ask = (o: ConfirmOptions) => Promise<boolean>;

const Ctx = createContext<Ask>(() => Promise.resolve(false));

export const useConfirm = (): Ask => useContext(Ctx);

export function ConfirmHost({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ opts: ConfirmOptions; resolve: (ok: boolean) => void } | null>(null);

  const ask = useCallback<Ask>((opts) => new Promise((resolve) => setPending({ opts, resolve })), []);
  const done = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <Ctx.Provider value={ask}>
      {children}
      {pending && (
        <Dialog
          title={pending.opts.title}
          onClose={() => done(false)}
          small
          footer={
            <div className="btn-row end">
              <button className="btn" onClick={() => done(false)}>
                Cancel
              </button>
              <button id="confirm-ok" className={`btn ${pending.opts.danger ? 'danger solid' : 'primary'}`} autoFocus onClick={() => done(true)}>
                {pending.opts.confirm}
              </button>
            </div>
          }
        >
          {pending.opts.message && <p className="confirm-text">{pending.opts.message}</p>}
        </Dialog>
      )}
    </Ctx.Provider>
  );
}
