import { NumberInput } from '@chakra-ui/react';
import { useEffect, useRef, useState } from 'react';

export interface NumberFieldProps {
  value: number | null;
  /** Called after typing pauses, on blur, on Enter and on stepper clicks. Empty commits null. */
  onCommit(value: number | null): void;
  label: string;
  min?: number;
  max?: number;
  step?: number;
  placeholder?: string;
  testId?: string;
  w?: string | number;
  disabled?: boolean;
  /** Clamp to [min, max] on commit (default true). */
  clamp?: boolean;
  id?: string;
}

const COMMIT_DELAY = 700;
const NO_GROUPING: Intl.NumberFormatOptions = { useGrouping: false, maximumFractionDigits: 3 };

function parse(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Small numeric input that keeps a local draft and commits it to the store only when the
 * user pauses, leaves the field or presses Enter, so half-typed values ("19") never
 * trigger a preview.
 */
export default function NumberField({
  value,
  onCommit,
  label,
  min,
  max,
  step = 1,
  placeholder,
  testId,
  w = '84px',
  disabled,
  clamp = true,
  id,
}: NumberFieldProps) {
  const [draft, setDraft] = useState(value == null ? '' : String(value));
  const focused = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Follow outside changes (brush, presets) unless the user is typing here.
  useEffect(() => {
    if (!focused.current) setDraft(value == null ? '' : String(value));
  }, [value]);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const commit = (s: string) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    let n = parse(s);
    if (n != null && clamp) {
      if (min != null) n = Math.max(min, n);
      if (max != null) n = Math.min(max, n);
    }
    if (n !== value) onCommit(n);
    if (!focused.current) setDraft(n == null ? '' : String(n));
  };

  const parsed = parse(draft);
  // Explicit, so an empty field (open range) is never shown as invalid.
  const outOfRange = parsed != null && ((min != null && parsed < min) || (max != null && parsed > max));

  return (
    <NumberInput.Root
      ids={id ? { input: id } : undefined}
      invalid={outOfRange}
      size="sm"
      w={w}
      value={draft}
      min={min}
      max={max}
      step={step}
      disabled={disabled}
      formatOptions={NO_GROUPING}
      allowMouseWheel={false}
      clampValueOnBlur={false}
      onValueChange={(e) => {
        setDraft(e.value);
        if (timer.current) clearTimeout(timer.current);
        timer.current = setTimeout(() => commit(e.value), COMMIT_DELAY);
      }}
      onFocusChange={(e) => {
        focused.current = e.focused;
        if (!e.focused) commit(draft);
      }}
    >
      <NumberInput.Control>
        <NumberInput.IncrementTrigger />
        <NumberInput.DecrementTrigger />
      </NumberInput.Control>
      <NumberInput.Input
        aria-label={label}
        placeholder={placeholder}
        data-testid={testId}
        bg="bg"
        fontVariantNumeric="tabular-nums"
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit((e.target as HTMLInputElement).value);
        }}
      />
    </NumberInput.Root>
  );
}
