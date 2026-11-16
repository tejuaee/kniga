import { useEffect, type ReactNode } from 'react';
import { XIcon } from './Icons';

/** Backdrop + dialog shell shared by the log form and the Top 4 picker. Esc or a backdrop click closes it. */
export function Modal({ onClose, labelledBy, children }: { onClose: () => void; labelledBy: string; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  return (
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
        <button className="modal__close icon-btn" onClick={onClose} aria-label="Close">
          <XIcon />
        </button>
        {children}
      </div>
    </div>
  );
}
