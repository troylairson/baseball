import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { SaveMeta } from '../../db/db';
import { useGame } from '../../state/game';
import { engine } from '../../worker/client';
import { Icon } from '../components/Icon';

export function Welcome() {
  const navigate = useNavigate();
  const load = useGame((s) => s.load);
  const [saves, setSaves] = useState<SaveMeta[] | null>(null);

  useEffect(() => {
    engine().listSaves().then(setSaves);
  }, []);

  const resume = async (id: string) => {
    if (await load(id)) navigate('/play/home');
  };

  return (
    <div className="pt-safe mx-auto flex min-h-dvh max-w-md flex-col px-4 py-10">
      <div className="mb-10 text-center">
        <div className="mx-auto mb-4 grid size-16 place-items-center rounded-2xl bg-accent text-3xl text-accent-contrast">◆</div>
        <h1 className="text-3xl font-bold tracking-tight">Diamond GM</h1>
        <p className="mt-2 text-muted">Build a dynasty. Scout, trade, develop, win.</p>
      </div>

      <Link to="/new" className="flex h-14 items-center justify-center rounded-2xl bg-accent text-base font-semibold text-accent-contrast">
        New Career
      </Link>

      {saves && saves.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 px-1 text-sm font-semibold uppercase tracking-wide text-muted">Continue</h2>
          <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
            {saves.map((s) => (
              <li key={s.id}>
                <button onClick={() => resume(s.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-surface-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{s.name}</span>
                    <span className="block text-xs text-muted">
                      {s.season} season · last played {new Date(s.updatedAt).toLocaleDateString()}
                    </span>
                  </span>
                  <Icon name="chevron" className="size-5 text-muted" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
