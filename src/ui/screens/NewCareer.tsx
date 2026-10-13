import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LEAGUE_SIZES, settingsFor } from '../../engine';
import { useGame } from '../../state/game';
import { Segmented } from '../components/Segmented';
import type { LeagueSource, TeamPreview } from '../../worker/api';
import { engine } from '../../worker/client';
import { Icon } from '../components/Icon';
import { RatingBadge } from '../components/Rating';
import { TeamBadge } from '../components/TeamBadge';
import { money } from '../format';

const MARKET = ['', 'Tiny', 'Small', 'Mid', 'Large', 'Huge'];

function Setting({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      {children}
      {help && <p className="mt-1 text-xs text-muted">{help}</p>}
    </div>
  );
}

type SourceKind = LeagueSource['kind'];

/** The bundled MLB rosters, fetched once. */
let mlbPack: Promise<string> | null = null;
const loadMlbPack = () =>
  (mlbPack ??= fetch(`${import.meta.env.BASE_URL}data/mlb.json`).then((r) => {
    if (!r.ok) throw new Error('Could not load the MLB rosters.');
    return r.text();
  }).catch((e: unknown) => {
    mlbPack = null;
    throw e;
  }));

export function NewCareer() {
  const navigate = useNavigate();
  const load = useGame((s) => s.load);
  const [teams, setTeams] = useState<TeamPreview[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [starting, setStarting] = useState(false);
  const [opts, setOpts] = useState({ teamCount: 20, gamesPerSeason: 162, designatedHitter: true, difficulty: 1 as 0 | 1 | 2 });
  const [kind, setKind] = useState<SourceKind>('fictional');
  const [file, setFile] = useState<{ name: string; json: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    engine().previewLeague().then(setTeams);
  }, []);

  const preview = async (next: typeof opts, source: LeagueSource) => {
    setTeams(null);
    setSelected(null);
    setError(null);
    try {
      setTeams(await engine().previewLeague(settingsFor(next), undefined, source));
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const sourceFor = async (k: SourceKind, f = file): Promise<LeagueSource | null> => {
    if (k === 'mlb') return { kind: 'mlb', json: await loadMlbPack() };
    if (k === 'file') return f ? { kind: 'file', json: f.json } : null;
    return { kind: 'fictional' };
  };

  const regenerate = async (next = opts, k = kind, f = file) => {
    setOpts(next);
    try {
      const source = await sourceFor(k, f);
      if (source) await preview(next, source);
    } catch (e) {
      setTeams(null);
      setError((e as Error).message);
    }
  };

  const chooseKind = (k: SourceKind) => {
    setKind(k);
    if (k === 'file' && !file) {
      setTeams(null);
      setSelected(null);
      setError(null);
      fileInput.current?.click();
      return;
    }
    void regenerate(opts, k);
  };

  const pickFile = async (f: File | undefined) => {
    if (!f) return;
    const next = { name: f.name, json: await f.text() };
    setFile(next);
    void regenerate(opts, 'file', next);
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
        <Link to="/" className="grid grid-cols-1 size-10 place-items-center rounded-full hover:bg-surface-2" aria-label="Back">
          <Icon name="back" />
        </Link>
        <h1 className="flex-1 text-xl font-bold">Choose your team</h1>
        {kind === 'fictional' && (
          <button onClick={() => void regenerate()} className="h-10 rounded-full px-4 text-sm font-medium text-accent hover:bg-surface-2">
            New league
          </button>
        )}
      </div>
      <div className="mb-3">
        <Segmented<SourceKind>
          label="League"
          value={kind}
          onChange={chooseKind}
          options={[{ value: 'fictional', label: 'Fictional' }, { value: 'mlb', label: 'Real MLB' }, { value: 'file', label: 'Import' }]}
        />
      </div>
      <input ref={fileInput} type="file" accept="application/json,.json" className="hidden" onChange={(e) => void pickFile(e.target.files?.[0])} />
      <p className="mb-5 text-sm text-muted">
        {kind === 'fictional' && 'A fictional league is generated each time. Weaker teams are a tougher rebuild; big markets can afford bigger payrolls.'}
        {kind === 'mlb' && 'All 30 clubs with their real 40-man rosters. Ratings are built from each player\u2019s last four seasons of MLB and minor league stats.'}
        {kind === 'file' && (
          <>
            {file ? <>Rosters from <strong className="text-ink">{file.name}</strong>. </> : 'Start from a roster file exported from another career, or one you made yourself. '}
            <button onClick={() => fileInput.current?.click()} className="font-medium text-accent">{file ? 'Choose another file' : 'Choose a file'}</button>
          </>
        )}
      </p>

      <details className="mb-5 rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-semibold">
          League settings <span className="font-normal text-muted">· {kind === 'fictional' ? `${opts.teamCount} teams · ` : ''}{opts.gamesPerSeason} games · {['Easy', 'Normal', 'Hard'][opts.difficulty]}</span>
        </summary>
        <div className="mt-4 grid gap-4">
          {kind === 'fictional' && (
            <Setting label="Teams">
              <Segmented label="Teams" value={String(opts.teamCount)} onChange={(v) => void regenerate({ ...opts, teamCount: Number(v) })}
                options={Object.keys(LEAGUE_SIZES).map((n) => ({ value: n, label: n }))} />
            </Setting>
          )}
          <Setting label="Season length">
            <Segmented label="Season length" value={String(opts.gamesPerSeason)} onChange={(v) => void regenerate({ ...opts, gamesPerSeason: Number(v) })}
              options={[60, 100, 162].map((n) => ({ value: String(n), label: `${n} games` }))} />
          </Setting>
          <Setting label="Designated hitter">
            <Segmented label="Designated hitter" value={opts.designatedHitter ? 'on' : 'off'} onChange={(v) => void regenerate({ ...opts, designatedHitter: v === 'on' })}
              options={[{ value: 'on', label: 'Universal DH' }, { value: 'off', label: 'Pitchers hit' }]} />
          </Setting>
          <Setting label="Difficulty" help="Harder means tougher trade partners and a less patient owner.">
            <Segmented label="Difficulty" value={String(opts.difficulty)} onChange={(v) => void regenerate({ ...opts, difficulty: Number(v) as 0 | 1 | 2 })}
              options={['Easy', 'Normal', 'Hard'].map((l, i) => ({ value: String(i), label: l }))} />
          </Setting>
        </div>
      </details>

      {error && <p role="alert" className="mb-5 rounded-xl bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p>}
      {!teams && !error && (kind !== 'file' || file) && <p className="py-20 text-center text-muted">{kind === 'mlb' ? 'Building MLB rosters…' : 'Generating league…'}</p>}

      {divisions.map((div) => (
        <section key={div} className="mb-5">
          <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted">{div}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
