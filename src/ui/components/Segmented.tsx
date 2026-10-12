export function Segmented<T extends string>({
  options, value, onChange, label,
}: { options: readonly { value: T; label: string }[]; value: T; onChange: (v: T) => void; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="flex rounded-xl bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 flex-1 rounded-lg px-3 text-sm font-medium ${
            o.value === value ? 'bg-surface text-ink shadow-sm dark:bg-line' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
