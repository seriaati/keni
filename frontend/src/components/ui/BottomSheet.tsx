import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface BottomSheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}

const CLOSE_MS = 260;
const DISMISS_DISTANCE = 80;
const DISMISS_VELOCITY = 0.5; // px/ms
// Ignore backdrop clicks this soon after opening — they're the tail of the gesture that opened it
const OPEN_GRACE_MS = 400;

/** Mobile drawer anchored to the bottom; drag the handle down to dismiss. */
export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  // Keep the last content around so it doesn't vanish during the exit animation
  const [content, setContent] = useState(children);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startT: number } | null>(null);
  const openedAt = useRef(0);

  if (open && !mounted) setMounted(true);
  if (open && content !== children) setContent(children);

  useEffect(() => {
    if (open || !mounted) return;
    const id = setTimeout(() => { setMounted(false); setDragY(0); }, CLOSE_MS);
    return () => clearTimeout(id);
  }, [open, mounted]);

  useEffect(() => {
    if (!open) return;
    openedAt.current = performance.now();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!mounted) return null;

  const onPointerDown = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { startY: e.clientY, startT: e.timeStamp };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setDragY(Math.max(0, e.clientY - drag.current.startY));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!drag.current) return;
    const dy = Math.max(0, e.clientY - drag.current.startY);
    const velocity = dy / Math.max(1, e.timeStamp - drag.current.startT);
    drag.current = null;
    setDragging(false);
    if (dy > DISMISS_DISTANCE || (dy > 20 && velocity > DISMISS_VELOCITY)) onClose();
    else setDragY(0);
  };

  return createPortal(
    <>
      <div
        className="bottom-sheet-backdrop"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? undefined : 'none' }}
        onClick={(e) => { if (e.timeStamp - openedAt.current > OPEN_GRACE_MS) onClose(); }}
      />
      <div
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        style={{
          transform: open ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragging ? 'none' : `transform ${CLOSE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div
          className="bottom-sheet-handle"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <span />
        </div>
        {open ? children : content}
      </div>
    </>,
    document.body,
  );
}
