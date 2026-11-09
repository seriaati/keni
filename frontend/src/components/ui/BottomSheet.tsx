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
// Movement before deciding whether a touch is a sheet drag or a scroll/tap
const SLOP = 8;

function scrollableAncestor(node: EventTarget | null, root: HTMLElement): HTMLElement | null {
  for (let el = node instanceof Element ? node : null; el && el !== root; el = el.parentElement) {
    if (el instanceof HTMLElement && el.scrollHeight > el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY)) return el;
  }
  return null;
}

/** Mobile drawer anchored to the bottom; swipe down anywhere on it to dismiss. */
export function BottomSheet({ open, onClose, children }: BottomSheetProps) {
  const [mounted, setMounted] = useState(open);
  // Keep the last content around so it doesn't vanish during the exit animation
  const [content, setContent] = useState(children);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startX: number; startY: number; startT: number; scroller: HTMLElement | null; active: boolean } | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
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
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); onClose(); } };
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  // Native listeners: touchmove must be non-passive to stop the content scrolling while the sheet is dragged
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const onStart = (e: TouchEvent) => {
      const t = e.touches[0];
      drag.current = e.touches.length === 1
        ? { startX: t.clientX, startY: t.clientY, startT: e.timeStamp, scroller: scrollableAncestor(e.target, el), active: false }
        : null;
    };
    const onMove = (e: TouchEvent) => {
      const d = drag.current;
      if (!d) return;
      const t = e.touches[0];
      if (!d.active) {
        const dx = t.clientX - d.startX;
        const dy = t.clientY - d.startY;
        if (Math.abs(dx) < SLOP && Math.abs(dy) < SLOP) return;
        // Upward, sideways, or inside content that can still scroll up: leave it to the browser
        if (dy <= 0 || Math.abs(dx) > dy || (d.scroller && d.scroller.scrollTop > 0)) {
          drag.current = null;
          return;
        }
        d.active = true;
        d.startY = t.clientY;
        setDragging(true);
      }
      e.preventDefault();
      setDragY(Math.max(0, t.clientY - d.startY));
    };
    const onEnd = (e: TouchEvent) => {
      const d = drag.current;
      drag.current = null;
      if (!d?.active) return;
      setDragging(false);
      const dy = e.type === 'touchcancel' ? 0 : Math.max(0, e.changedTouches[0].clientY - d.startY);
      const velocity = dy / Math.max(1, e.timeStamp - d.startT);
      if (dy > DISMISS_DISTANCE || (dy > 20 && velocity > DISMISS_VELOCITY)) onClose();
      else setDragY(0);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [mounted, onClose]);

  if (!mounted) return null;

  return createPortal(
    <>
      <div
        className="bottom-sheet-backdrop"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? undefined : 'none' }}
        onClick={(e) => { if (e.timeStamp - openedAt.current > OPEN_GRACE_MS) onClose(); }}
      />
      <div
        ref={sheetRef}
        className="bottom-sheet"
        role="dialog"
        aria-modal="true"
        style={{
          transform: open ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragging ? 'none' : `transform ${CLOSE_MS}ms cubic-bezier(0.16, 1, 0.3, 1)`,
        }}
        onContextMenu={(e) => e.preventDefault()}
      >
        <div className="bottom-sheet-handle">
          <span />
        </div>
        {open ? children : content}
      </div>
    </>,
    document.body,
  );
}
