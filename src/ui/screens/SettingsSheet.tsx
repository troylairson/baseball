import { useNavigate } from 'react-router-dom';
import { useGame } from '../../state/game';
import { useTheme, type ThemePref } from '../../state/theme';
import { engine } from '../../worker/client';
import { BottomSheet } from '../components/BottomSheet';
import { Segmented } from '../components/Segmented';

const THEMES = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
] as const;

export function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const { pref, setPref } = useTheme();
  const save = useGame((s) => s.save);
  const close = useGame((s) => s.close);

  const exit = () => {
    onClose();
    close();
    navigate('/');
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
      <section className="flex flex-col gap-2">
        <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-muted">Career</h3>
        <p className="text-sm text-muted">Progress is saved automatically on this device.</p>
        <button onClick={exit} className="h-12 rounded-xl border border-line font-medium hover:bg-surface-2">Switch career</button>
        <button onClick={remove} className="h-12 rounded-xl font-medium text-danger hover:bg-surface-2">Delete this career</button>
      </section>
    </BottomSheet>
  );
}
