import { createContext, useContext, useState, type ReactNode } from 'react';
import type { Book, Entry } from './api';
import { LogModal } from './components/LogModal';

interface LogState {
  /** Open the log modal: with no args it starts at book search (the "+ Log" button). */
  openLog: (opts?: { book?: Book; entry?: Entry }) => void;
  /** Bumps whenever an entry is created/edited/deleted, so pages can refetch. */
  version: number;
}

const LogContext = createContext<LogState | null>(null);

export function LogProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState<null | { book?: Book; entry?: Entry }>(null);
  const [version, setVersion] = useState(0);
  return (
    <LogContext.Provider value={{ openLog: (o) => setOpen(o ?? {}), version }}>
      {children}
      {open && (
        <LogModal
          initialBook={open.entry?.book ?? open.book}
          entry={open.entry}
          onClose={() => setOpen(null)}
          onSaved={() => {
            setVersion((v) => v + 1);
            setOpen(null);
          }}
        />
      )}
    </LogContext.Provider>
  );
}

export function useLog() {
  const ctx = useContext(LogContext);
  if (!ctx) throw new Error('useLog must be used inside <LogProvider>');
  return ctx;
}
