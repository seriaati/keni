import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil } from 'lucide-react';

export interface EditContextMenuState<T> {
  x: number;
  y: number;
  item: T;
}

export function useEditContextMenu<T>() {
  const [state, setState] = useState<EditContextMenuState<T> | null>(null);
  const open = useCallback((e: React.MouseEvent, item: T) => {
    // Desktop only — let touch devices keep native behavior
    if (window.matchMedia('(pointer: coarse)').matches) return;
    e.preventDefault();
    e.stopPropagation();
    setState({ x: e.clientX, y: e.clientY, item });
  }, []);
  const close = useCallback(() => setState(null), []);
  return { state, open, close };
}

const MENU_WIDTH = 180;
const MARGIN = 8;

/** Right-click menu with a single "edit" entry. */
export function EditContextMenu({
  state,
  label,
  onEdit,
  onClose,
}: {
  state: { x: number; y: number } | null;
  label: string;
  onEdit: () => void;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number } | null>(null);
  const [hovered, setHovered] = useState(false);

  // Clamp menu position to the viewport
  useLayoutEffect(() => {
    if (!state) { setPos(null); return; }
    const h = menuRef.current?.offsetHeight ?? 0;
    const w = menuRef.current?.offsetWidth ?? MENU_WIDTH;
    setPos({
      x: Math.max(MARGIN, Math.min(state.x, window.innerWidth - w - MARGIN)),
      y: Math.max(MARGIN, Math.min(state.y, window.innerHeight - h - MARGIN)),
    });
  }, [state]);

  // Close on outside click, Escape, scroll, resize
  useEffect(() => {
    if (!state) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current?.contains(e.target as Node)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    const onDismiss = () => onClose();
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', onDismiss, true);
    window.addEventListener('resize', onDismiss);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', onDismiss, true);
      window.removeEventListener('resize', onDismiss);
    };
  }, [state, onClose]);

  if (!state) return null;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: 'fixed',
        top: pos?.y ?? state.y,
        left: pos?.x ?? state.x,
        width: MENU_WIDTH,
        zIndex: 9999,
        background: 'var(--surface)',
        border: '1.5px solid var(--sand)',
        borderRadius: 'var(--radius)',
        boxShadow: 'var(--shadow)',
        padding: 4,
        visibility: pos ? 'visible' : 'hidden',
        animation: 'ssDropIn 0.12s cubic-bezier(0.16, 1, 0.3, 1) both',
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <button
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          width: '100%',
          padding: '7px 10px',
          border: 'none',
          borderRadius: 'calc(var(--radius) - 4px)',
          background: hovered ? 'var(--cream)' : 'transparent',
          fontSize: 13,
          fontFamily: 'var(--font-body)',
          color: 'var(--ink)',
          cursor: 'pointer',
          textAlign: 'left',
          transition: 'background 0.1s',
        }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onClick={() => { onClose(); onEdit(); }}
      >
        <Pencil size={14} style={{ color: 'var(--ink-light)', flexShrink: 0 }} />
        {label}
      </button>
    </div>,
    document.body,
  );
}
