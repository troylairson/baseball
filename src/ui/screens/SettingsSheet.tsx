import { useNavigate } from 'react-router-dom';
import { api, useGame } from '../../state/game';
import { useTheme, type ThemePref } from '../../state/theme';
import { engine } from '../../worker/client';
import { BottomSheet } from '../components/BottomSheet';
import { Segmented } from '../components/Segmented';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export function SettingsSheet({ open, onClose, onShowGuide }: { open: boolean; onClose: () => void; onShowGuide: () => void }) {
  const navigate = useNavigate();
  const { pref, setPref } = useTheme();
  const save = useGame((s) => s.save);
  const close = useGame((s) => s.close);
  const act = useGame((s) => s.act);

  const exit = () => {
    onClose();
    close();
    navigate('/');
  };

  const exportCareer = async () => {
    if (!save) return;
    const json = await engine().exportCareer(save.meta.id);
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${save.meta.name.replace(/[^\w-]+/g, '-')}-${save.league.season}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const remove = async () => {
    if (!save || !window.confirm(`Delete "${save.meta.name}"? This cannot be undone.`)) return;
    await engine().deleteSave(save.meta.id);
    exit();
  };

  return (
    <BottomSheet open={open} onClose={onClose} title="Settings">
      <h2 className="mb-4 text-xl font-bold">Settings</h2>
      <section className="mb-6">
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Appearance</h3>
        <Segmented<ThemePref> label="Theme" options={THEMES} value={pref} onChange={setPref} />
      </section>
      {save && (
        <section className="mb-6">
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Assistant GM</h3>
          <label className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
            <span>
              <span className="block font-medium">Handle call-ups</span>
              <span className="block text-xs text-muted">Weekly, swap clearly better minor leaguers onto the active roster.</span>
            </span>
            <input
              type="checkbox"
              className="size-5 accent-[var(--accent)]"
              checked={!!save.teams.find((t) => t.id === save.meta.userTeamId)?.autoRoster}
              onChange={(e) => void act(() => api().setAutoRoster(e.target.checked))}
            />
          </label>
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Career</h3>
        <p className="text-sm text-muted">Progress is saved automatically on this device. Export a file to back it up or move it to another device.</p>
        <button onClick={onShowGuide} className="h-12 rounded-xl border border-line font-medium hover:bg-surface-2">Show welcome guide</button>
        <button onClick={() => void exportCareer()} className="h-12 rounded-xl border border-line font-medium hover:bg-surface-2">Export career file</button>
        <button onClick={exit} className="h-12 rounded-xl border border-line font-medium hover:bg-surface-2">Switch career</button>
        <button onClick={remove} className="h-12 rounded-xl font-medium text-danger hover:bg-surface-2">Delete this career</button>
      </section>
    </BottomSheet>
  );
}
