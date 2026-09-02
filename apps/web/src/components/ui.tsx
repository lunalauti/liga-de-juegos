import type { ReactNode } from 'react';

/** Componentes base del artboard 06. Cualquier pantalla se arma con esto. */

export function Seal() {
  return <span className="lj-seal" aria-hidden="true">✓</span>;
}

type ChipKind = 'verified' | 'manual' | 'dnf' | 'streak' | 'wins' | 'tied';

export function Chip({ kind, children }: { kind: ChipKind; children: ReactNode }) {
  return (
    <span className={`lj-chip lj-chip--${kind}`}>
      {kind === 'verified' && <Seal />}
      {children}
    </span>
  );
}

export function PositionBadge({ position }: { position: number | null }) {
  const variant = position === null ? 'none' : position === 1 ? 'first' : position <= 3 ? 'strong' : 'plain';
  return (
    <span className={`lj-badge lj-badge--${variant}`}>{position ?? '—'}</span>
  );
}

export function Avatar({ initials, variant = 'default' }: { initials: string; variant?: 'default' | 'me' | 'idle' }) {
  return <span className={`lj-avatar lj-avatar--${variant}`}>{initials}</span>;
}

export interface RankRowProps {
  position: number;
  initials: string;
  name: string;
  total: string;
  variant?: 'default' | 'leader' | 'me' | 'idle';
  chips?: ReactNode;
}

export function RankRow({ position, initials, name, total, variant = 'default', chips }: RankRowProps) {
  return (
    <div className={`lj-row lj-row--${variant}`}>
      <span className="lj-row__pos">{position}</span>
      <div className="lj-row__player">
        <Avatar initials={initials} variant={variant === 'me' ? 'me' : variant === 'idle' ? 'idle' : 'default'} />
        <span className="lj-row__name">{name}</span>
        {chips}
      </div>
      <span className="lj-row__total">{total}</span>
    </div>
  );
}

export function GameCard({
  label,
  value,
  state = 'empty',
}: {
  label: string;
  value: string;
  state?: 'empty' | 'focus' | 'dnf';
}) {
  return (
    <div className={`lj-game lj-game--${state}`}>
      <span className="lj-game__label">{label}</span>
      <div className="lj-game__field">
        <span>{value}</span>
        {state === 'dnf' && <span className="lj-game__penalty">CASTIGO</span>}
      </div>
    </div>
  );
}
