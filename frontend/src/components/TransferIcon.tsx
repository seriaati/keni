import { ArrowLeftRight } from 'lucide-react';

export function TransferIcon({ size = 16, containerSize = 32, borderRadius = 8 }: {
  size?: number;
  containerSize?: number;
  borderRadius?: number;
}) {
  return (
    <div
      style={{
        width: containerSize,
        height: containerSize,
        borderRadius,
        background: 'var(--cream-darker)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <ArrowLeftRight size={size} color="var(--ink-mid)" strokeWidth={1.75} />
    </div>
  );
}
