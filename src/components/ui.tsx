import {
  useCallback,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from 'react';
import { X } from 'lucide-react';
import { create } from 'zustand';

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */
type ButtonVariant = 'primary' | 'secondary' | 'accent' | 'ghost' | 'danger';
type ButtonSize = 'md' | 'sm';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  className = '',
  ...rest
}: ButtonProps) {
  const cls = ['btn', `btn--${variant}`, size === 'sm' ? 'btn--sm' : '', block ? 'btn--block' : '', className]
    .filter(Boolean)
    .join(' ');
  return <button className={cls} {...rest} />;
}

/* ------------------------------------------------------------------ */
/* Status dot                                                          */
/* ------------------------------------------------------------------ */
type DotVariant = 'agent' | 'attention' | 'danger' | 'neutral' | 'accent';

export function StatusDot({ variant = 'neutral' }: { variant?: DotVariant }) {
  return <span className={`dot dot--${variant}`} aria-hidden />;
}

/* ------------------------------------------------------------------ */
/* Badge                                                               */
/* ------------------------------------------------------------------ */
type BadgeVariant = 'neutral' | 'accent' | 'agent' | 'attention' | 'danger' | 'test';

export function Badge({ variant = 'neutral', children }: { variant?: BadgeVariant; children: ReactNode }) {
  return <span className={`badge badge--${variant}`}>{children}</span>;
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */
export function Card({
  title,
  children,
  className = '',
  flat = false,
}: {
  title?: ReactNode;
  children: ReactNode;
  className?: string;
  flat?: boolean;
}) {
  return (
    <div className={`card ${flat ? 'card--flat' : ''} ${className}`}>
      {title ? <h3 className="card__title">{title}</h3> : null}
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 表单字段                                                            */
/* ------------------------------------------------------------------ */
export function Field({
  label,
  optional = false,
  hint,
  error,
  children,
}: {
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="field">
      <span className="field__label">
        {label} {optional ? <span className="field__optional">（可选）</span> : null}
      </span>
      {children}
      {hint ? <span className="hint">{hint}</span> : null}
      {error ? <span className="error">{error}</span> : null}
    </div>
  );
}

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="input" {...props} />;
}

export function Textarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="textarea" {...props} />;
}

export function Select({
  options,
  ...rest
}: InputHTMLAttributes<HTMLSelectElement> & { options: { value: string; label: string }[] }) {
  return (
    <select className="select" {...rest}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* 标签输入（多选自由文本）                                            */
/* ------------------------------------------------------------------ */
export function TagInput({
  value,
  onChange,
  placeholder = '输入后回车添加',
  addLabel = '添加',
  suggestions = [],
}: {
  value: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  addLabel?: string;
  suggestions?: string[];
}) {
  const [draft, setDraft] = useState('');

  const add = useCallback(() => {
    const text = draft.trim();
    if (text && !value.includes(text)) {
      onChange([...value, text]);
    }
    setDraft('');
  }, [draft, value, onChange]);

  const remove = useCallback(
    (item: string) => onChange(value.filter((v) => v !== item)),
    [value, onChange],
  );

  const addSuggestion = useCallback(
    (s: string) => {
      if (!value.includes(s)) onChange([...value, s]);
    },
    [value, onChange],
  );

  return (
    <div>
      <div className="tag-input__items">
        {value.map((item) => (
          <span className="tag" key={item}>
            {item}
            <button
              type="button"
              className="tag__remove"
              onClick={() => remove(item)}
              aria-label={`删除 ${item}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
      </div>
      <div className="tag-input__row mt-8">
        <Input
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        />
        <Button variant="secondary" size="sm" onClick={add} type="button">
          {addLabel}
        </Button>
      </div>
      {suggestions.length > 0 ? (
        <div className="tag-input__items mt-8">
          {suggestions
            .filter((s) => !value.includes(s))
            .map((s) => (
              <button type="button" key={s} className="choice" onClick={() => addSuggestion(s)}>
                {s}
              </button>
            ))}
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 单选 / 多选组（Radio / Chip 风格）                                  */
/* ------------------------------------------------------------------ */
export function ChoiceGroup<T extends string>({
  options,
  value,
  onChange,
  multiple = false,
}: {
  options: { value: T; label: ReactNode }[];
  value: T | T[];
  onChange: (next: T | T[]) => void;
  multiple?: boolean;
}) {
  const isActive = (v: T) => (multiple ? (value as T[]).includes(v) : value === v);

  const handleClick = (v: T) => {
    if (multiple) {
      const list = value as T[];
      onChange(list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
    } else {
      onChange(v);
    }
  };

  return (
    <div className="choice-group">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          className={`choice ${isActive(o.value) ? 'choice--active' : ''}`}
          onClick={() => handleClick(o.value)}
          aria-pressed={isActive(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Segmented control（两态 / 三态等离散选择）                          */
/* ------------------------------------------------------------------ */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="segmented" role="radiogroup">
      {options.map((o) => (
        <button
          type="button"
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className={`segmented__item ${value === o.value ? 'segmented__item--active' : ''}`}
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Switch（仅表示开 / 关）                                             */
/* ------------------------------------------------------------------ */
export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label?: ReactNode;
}) {
  return (
    <label className="row" style={{ cursor: 'pointer', alignItems: 'center', margin: 0 }}>
      <span className="switch">
        <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
        <span className="switch__track" />
      </span>
      {label ? <span style={{ flex: 1 }}>{label}</span> : null}
    </label>
  );
}

/* ------------------------------------------------------------------ */
/* Slider                                                              */
/* ------------------------------------------------------------------ */
export function Slider({
  value,
  onChange,
  min = 0,
  max = 120,
  step = 5,
  format = (v) => `${v}`,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="small" style={{ fontSize: 15, color: 'var(--jp-text-primary)' }}>
        {format(value)}
      </div>
      <input
        type="range"
        className="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Toast                                                               */
/* ------------------------------------------------------------------ */
interface ToastItem {
  id: number;
  message: string;
  kind: 'info' | 'error';
}

interface ToastState {
  toasts: ToastItem[];
  push: (message: string, kind?: 'info' | 'error') => void;
}

const useToastStore = create<ToastState>((set) => ({
  toasts: [],
  push: (message, kind = 'info') => {
    const id = Date.now() + Math.random();
    set((s) => ({ toasts: [...s.toasts, { id, message, kind }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3200);
  },
}));

export function useToast() {
  return useToastStore((s) => s.push);
}

export function ToastHost() {
  const toasts = useToastStore((s) => s.toasts);
  return (
    <div className="toast-wrap" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast ${t.kind === 'error' ? 'toast--error' : ''}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}
