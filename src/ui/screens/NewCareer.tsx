import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useGame } from '../../state/game';
import type { TeamPreview } from '../../worker/api';
import { engine } from '../../worker/client';
import { Icon } from '../components/Icon';
import { RatingBadge } from '../components/Rating';
import { TeamBadge } from '../components/TeamBadge';
import { money } from '../format';

const MARKET = ['', 'Tiny', 'Small', 'Mid', 'Large', 'Huge'];

export function NewCareer() {
  const navigate = useNavigate();
  const load = useGame((s) => s.load);
  const [teams, setTeams] = useState<TeamPreview[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    engine().previewLeague().then(setTeams);
  }, []);

  const regenerate = () => {
    setTeams(null);
    setSelected(null);
    engine().previewLeague().then(setTeams);
  };

  const start = async () => {
    if (selected === null) return;
    setStarting(true);
    const id = await engine().startCareer(selected);
    await load(id);
    navigate('/play/home', { replace: true });
  };

  const divisions = teams ? [...new Set(teams.map((t) => t.divisionName))] : [];

  return (
    <div className="pt-safe mx-auto min-h-dvh max-w-2xl px-4 pb-32 pt-4">
      <div className="mb-4 flex items-center gap-2">
        <Link to="/" className="grid size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Back">
          <Icon name="back" />
        </Link>
        <h1 className="flex-1 text-xl font-bold">Choose your team</h1>
        <button onClick={regenerate} className="h-10 rounded-full px-4 text-sm font-medium text-accent hover:bg-surface-2">
          New league
        </button>
      </div>
      <p className="mb-5 text-sm text-muted">
        A fictional league is generated each time. Weaker teams are a tougher rebuild; big markets can afford bigger payrolls.
      </p>

      {!teams && <p className="py-20 text-center text-muted">Generating league…</p>}

      {divisions.map((div) => (
        <section key={div} className="mb-5">
          <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted">{div}</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {teams!.filter((t) => t.divisionName === div).map((t) => (
              <button
                key={t.id}
                onClick={() => setSelected(t.id)}
                aria-pressed={selected === t.id}
                className={`flex items-center gap-3 rounded-2xl border bg-surface p-3 text-left transition-colors ${
                  selected === t.id ? 'border-accent ring-2 ring-accent/30' : 'border-line hover:border-muted'
                }`}
              >
                <TeamBadge team={t} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{t.city} {t.name}</span>
                  <span className="block text-xs text-muted">{MARKET[t.market]} market · {money(t.payroll)} payroll</span>
                </span>
                <RatingBadge value={t.overall} label="TEAM" />
              </button>
            ))}
          </div>
        </section>
      ))}

      <div className="pb-safe fixed inset-x-0 bottom-0 border-t border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto max-w-2xl p-4">
          <button
            onClick={start}
            disabled={selected === null || starting}
            className="h-14 w-full rounded-2xl bg-accent text-base font-semibold text-accent-contrast disabled:opacity-40"
          >
            {starting ? 'Starting…' : selected === null ? 'Select a team' : `Manage the ${teams?.find((t) => t.id === selected)?.name}`}
          </button>
        </div>
      </div>
    </div>
  );
}
