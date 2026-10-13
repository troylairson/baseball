import { DEFAULT_STRATEGY, type TeamStrategy } from '../../../engine';
import { api, useGame, useUserTeam } from '../../../state/game';
import { Card } from '../../components/Card';
import { Segmented } from '../../components/Segmented';

const DIALS: { key: keyof TeamStrategy; label: string; help: string; options: [string, string, string] }[] = [
  { key: 'baserunning', label: 'Baserunning', help: 'Steal attempts and taking the extra base.', options: ['Conservative', 'Balanced', 'Aggressive'] },
  { key: 'smallBall', label: 'Small ball', help: 'Sacrifice bunts with weak hitters or in close, late games.', options: ['Never', 'Sometimes', 'Often'] },
  { key: 'starterLeash', label: 'Starter leash', help: 'How long starters stay in before the bullpen takes over.', options: ['Quick hook', 'Normal', 'Long'] },
];

export function StrategyCard() {
  const team = useUserTeam();
  const act = useGame((s) => s.act);
  const strategy = team.strategy ?? DEFAULT_STRATEGY;
  return (
    <Card title="Team strategy" className="mt-4">
      <div className="flex flex-col gap-4">
        {DIALS.map((d) => (
          <div key={d.key}>
            <p className="mb-1 text-sm font-medium">{d.label}</p>
            <Segmented
              label={d.label}
              value={String(strategy[d.key])}
              onChange={(v) => void act(() => api().setStrategy({ ...strategy, [d.key]: Number(v) as 0 | 1 | 2 }))}
              options={d.options.map((o, i) => ({ value: String(i), label: o }))}
            />
            <p className="mt-1 text-xs text-muted">{d.help}</p>
          </div>
        ))}
      </div>
    </Card>
  );
}
