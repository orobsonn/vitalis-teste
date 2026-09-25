import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./ui";

export interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface Props {
  id?: string;
  label: string;
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

export function SelectMenu({ id, label, value, options, onChange, disabled, invalid, describedBy, className = "" }: Props) {
  const generatedId = useId();
  const triggerId = id ?? generatedId;
  const listId = `${triggerId}-options`;
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const [active, setActive] = useState(-1);
  const selected = options.find(option => option.value === value);
  const shown = selected?.label ?? (value || options[0]?.label || label);
  const visible = open && !disabled;

  useEffect(() => {
    if (visible && active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, visible]);
  useEffect(() => {
    if (!visible) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) close();
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [visible]);
  useEffect(() => {
    setActive(-1);
    setOpen(false);
  }, [options.map(option => option.value).join("\u0000")]);

  function show() {
    const rect = root.current?.getBoundingClientRect();
    setAbove(Boolean(rect && window.innerHeight - rect.bottom < 250 && rect.top > window.innerHeight - rect.bottom));
    setOpen(true);
  }
  function close() { setOpen(false); setActive(-1); }
  function choose(next: string) { onChange(next); close(); trigger.current?.focus(); }
  function initial() { return Math.max(0, options.findIndex(option => option.value === value)); }

  return <div ref={root} className={`select-menu ${className}`} onBlur={event => {
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
  }}>
    <button ref={trigger} id={triggerId} type="button" role="combobox" aria-label={label}
      aria-haspopup="listbox" aria-expanded={visible} aria-controls={visible ? listId : undefined}
      aria-activedescendant={visible && active >= 0 ? `${listId}-${active}` : undefined}
      aria-invalid={invalid || undefined} aria-describedby={describedBy} disabled={disabled}
      className="control select-trigger" onClick={() => { if (visible) close(); else { setActive(initial()); show(); } }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing) return;
        if (event.key === "ArrowDown" || event.key === "ArrowUp" || event.key === "Home" || event.key === "End") {
          event.preventDefault();
          const count = options.length;
          if (!count) return;
          if (!visible) { setActive(initial()); show(); return; }
          setActive(previous => event.key === "Home" ? 0 : event.key === "End" ? count - 1
            : event.key === "ArrowDown" ? (previous + 1) % count : (previous - 1 + count) % count);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          if (visible && active >= 0 && options[active]) choose(options[active].value);
          else if (!visible) { setActive(initial()); show(); }
        } else if (event.key === "Escape" && visible) { event.preventDefault(); event.stopPropagation(); close(); }
        else if (event.key === "Tab") close();
      }}>
      <span className={value ? undefined : "select-placeholder"}>{shown}</span><Icon name="chevron" size={15} />
    </button>
    {visible && <div className={`procedure-popup select-popup ${above ? "above" : ""}`}><ul ref={list} id={listId} className="procedure-options" role="listbox" aria-label={label}>
      {options.map((option, index) => <li key={`${option.value}-${index}`} role="presentation"><button type="button"
        id={`${listId}-${index}`} role="option" aria-selected={index === active} tabIndex={-1}
        className="procedure-option" onClick={() => choose(option.value)} onMouseDown={event => event.preventDefault()}
        onPointerMove={event => { if (event.pointerType === "mouse") setActive(index); }}>
        <strong>{option.label}</strong>{option.description && <span>{option.description}</span>}
      </button></li>)}
    </ul>{options.length === 0 && <p className="procedure-no-results">Nenhuma opção disponível.</p>}</div>}
  </div>;
}
