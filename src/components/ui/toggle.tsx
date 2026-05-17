export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      data-on={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="switch"
    >
      <span className="switch-knob" />
    </button>
  );
}
