import type { Team } from '../../engine';

export function TeamBadge({ team, size = 'md' }: { team: Pick<Team, 'abbr' | 'primaryColor' | 'secondaryColor'>; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? 'size-14 text-base' : size === 'sm' ? 'size-7 text-[10px]' : 'size-10 text-xs';
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-xl font-bold tracking-tight ${dims}`}
      style={{ background: team.primaryColor, color: '#fff', boxShadow: `inset 0 -3px 0 ${team.secondaryColor}` }}
      aria-hidden="true"
    >
      {team.abbr}
    </span>
  );
}
