import { chemistryFactors, chemistryLabel, NEUTRAL_CHEMISTRY, type Team } from '../../engine';
import { useSave } from '../../state/game';
import { Card } from './Card';

const TONE = {
  Great: 'bg-accent/15 text-accent',
  Good: 'bg-accent/10 text-accent',
  Neutral: 'bg-surface-2 text-muted',
  Tense: 'bg-amber-400/20 text-amber-700 dark:text-amber-300',
  Toxic: 'bg-danger/15 text-danger',
} as const;

export function ChemistryChip({ chemistry }: { chemistry: number | undefined }) {
  const label = chemistryLabel(chemistry);
  return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${TONE[label]}`}>{label}</span>;
}

/** Team chemistry with what's driving it. */
export function ClubhouseCard({ team }: { team: Team }) {
  const save = useSave();
  const chem = team.chemistry ?? NEUTRAL_CHEMISTRY;
  const factors = chemistryFactors(save, team.id);
  return (
    <Card title="Clubhouse" action={<ChemistryChip chemistry={chem} />}>
      <div className="mb-1 flex justify-between text-sm">
        <span className="text-muted">Team chemistry</span>
        <strong className="tabular-nums">{chem}</strong>
      </div>
      <div className="h-2 rounded-full bg-surface-2" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={chem} aria-label="Team chemistry">
        <div className={`h-full rounded-full ${chem < 42 ? 'bg-danger' : 'bg-accent'}`} style={{ width: `${chem}%` }} />
      </div>
      {factors.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {factors.map((f) => (
            <li key={f.label} className="flex gap-2">
              <span className={f.value > 0 ? 'text-accent' : 'text-danger'} aria-hidden>{f.value > 0 ? '▲' : '▼'}</span>
              <span className="min-w-0 flex-1">{f.label}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted">A quiet clubhouse so far.</p>
      )}
      <p className="mt-3 text-xs text-muted">
        Good chemistry gives everyone a small lift on the field and keeps players happy. Veteran leaders help; troublemakers, trade demands and heavy roster turnover hurt.
      </p>
    </Card>
  );
}
