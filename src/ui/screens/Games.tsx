import { PageHeader } from '../components/Card';
import { Icon } from '../components/Icon';

export function Games() {
  return (
    <>
      <PageHeader title="Games" subtitle="Schedule, results and box scores" />
      <div className="flex flex-col items-center rounded-2xl border border-dashed border-line px-6 py-16 text-center">
        <span className="mb-3 grid size-14 place-items-center rounded-2xl bg-surface-2 text-muted">
          <Icon name="games" className="size-7" />
        </span>
        <p className="font-semibold">Opening Day is coming</p>
        <p className="mt-1 max-w-sm text-sm text-muted">
          The game engine and schedule are next on the roadmap. You'll be able to sim days, weeks or the whole season from here.
        </p>
      </div>
    </>
  );
}
