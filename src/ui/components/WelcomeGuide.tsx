import { useState } from 'react';
import { BottomSheet } from './BottomSheet';
import { Icon, type IconName } from './Icon';

const KEY = 'dgm.guideSeen';

const STEPS: { icon: IconName; title: string; body: string }[] = [
  {
    icon: 'home',
    title: 'Welcome, GM',
    body: 'Home is your dashboard: to-dos, your owner’s expectations, suggestions from your assistant GM and an inbox of league news.',
  },
  {
    icon: 'play',
    title: 'Play ball',
    body: 'The green button plays your next game. Its arrow sims a week, a month or the season — or lets you manage a game live, making the calls yourself.',
  },
  {
    icon: 'roster',
    title: 'Shape your roster',
    body: 'Set the lineup, rotation and bullpen (or leave them on Auto), choose a team strategy, and call up prospects from AAA. Ratings are scouting estimates — the shaded range shows how sure your scouts are.',
  },
  {
    icon: 'office',
    title: 'Run the front office',
    body: 'Make trades, sign free agents, hire coaches and set the scouting budget. After the season: re-sign players, chase free agents and run the draft. Keep the owner happy to keep your job.',
  },
];

export function guideSeen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

export function markGuideSeen(seen: boolean): void {
  try {
    if (seen) localStorage.setItem(KEY, '1');
    else localStorage.removeItem(KEY);
  } catch {
    // Storage unavailable; the guide may show again next time.
  }
}

export function WelcomeGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [step, setStep] = useState(0);
  const s = STEPS[step]!;
  const last = step === STEPS.length - 1;
  const close = () => {
    markGuideSeen(true);
    setStep(0);
    onClose();
  };
  return (
    <BottomSheet open={open} onClose={close} title="Welcome guide">
      <div className="pt-4 text-center">
        <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-accent/12 text-accent"><Icon name={s.icon} className="size-7" /></span>
        <h2 className="mt-4 text-xl font-bold">{s.title}</h2>
        <p className="mx-auto mt-2 max-w-sm text-muted">{s.body}</p>
        <div className="mt-5 flex justify-center gap-1.5" aria-label={`Step ${step + 1} of ${STEPS.length}`}>
          {STEPS.map((_, i) => <span key={i} className={`h-1.5 rounded-full ${i === step ? 'w-6 bg-accent' : 'w-1.5 bg-line'}`} />)}
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button onClick={close} className="h-12 rounded-xl border border-line font-medium hover:bg-surface-2">Skip</button>
          <button onClick={() => (last ? close() : setStep(step + 1))} className="h-12 rounded-xl bg-accent font-semibold text-accent-contrast">
            {last ? 'Let’s go' : 'Next'}
          </button>
        </div>
      </div>
    </BottomSheet>
  );
}
