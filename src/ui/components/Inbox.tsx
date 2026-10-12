import { useState } from 'react';
import type { NewsItem } from '../../engine';
import { useOpenPlayer } from '../hooks';
import { Card } from './Card';

const KIND_LABEL: Record<NewsItem['kind'], string> = {
  league: 'League', team: 'Team', transaction: 'Move', award: 'Award', owner: 'Owner', draft: 'Draft',
};

export function Inbox({ news }: { news: NewsItem[] }) {
  const openPlayer = useOpenPlayer();
  const [mineOnly, setMineOnly] = useState(false);
  const [limit, setLimit] = useState(6);
  const items = news.filter((n) => !mineOnly || n.mine).slice(0, limit);
  return (
    <Card
      title="Inbox"
      action={
        <button onClick={() => setMineOnly((v) => !v)} className="text-xs font-medium text-accent">
          {mineOnly ? 'Show all' : 'My team only'}
        </button>
      }
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted">Nothing yet.</p>
      ) : (
        <ul className="-mx-2">
          {items.map((n) => {
            const body = (
              <>
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.mine ? 'bg-accent' : 'bg-line'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] uppercase tracking-wide text-muted">
                    {KIND_LABEL[n.kind]} · {new Date(`${n.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                  </span>
                  <span className="block font-medium">{n.title}</span>
                  {n.body && <span className="block text-sm text-muted">{n.body}</span>}
                </span>
              </>
            );
            const cls = 'flex w-full gap-3 rounded-xl px-2 py-2 text-left';
            return (
              <li key={n.id}>
                {n.playerId !== undefined ? (
                  <button onClick={() => openPlayer(n.playerId!)} className={`${cls} hover:bg-surface-2`}>{body}</button>
                ) : (
                  <div className={cls}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {news.filter((n) => !mineOnly || n.mine).length > limit && (
        <button onClick={() => setLimit((l) => l + 10)} className="mt-2 h-10 w-full rounded-xl border border-line text-sm font-medium hover:bg-surface-2">Show more</button>
      )}
    </Card>
  );
}
