import { createContext, useContext, useState } from 'react';
import { LogModal } from './components/LogModal';

const LogContext = createContext(null);

export function LogProvider({ children }) {
  const [open, setOpen] = useState(null);
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
