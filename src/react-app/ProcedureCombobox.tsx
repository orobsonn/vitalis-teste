import { useEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { Icon } from "./ui";

interface Procedimento { codigo: string; descricao: string }
type Props = Pick<InputHTMLAttributes<HTMLInputElement>, "id" | "disabled" | "maxLength" | "onBlur" | "aria-invalid" | "aria-describedby"> & {
  value: string;
  procedimentos: readonly Procedimento[];
  onValueChange: (codigo: string) => void;
};

const textoBusca = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
export function filtrarProcedimentos(procedimentos: readonly Procedimento[], query: string): Procedimento[] {
  const busca = textoBusca(query);
  return procedimentos.filter(item => textoBusca(`${item.codigo} ${item.descricao}`).includes(busca));
}

export function ProcedureCombobox({ value, procedimentos, onValueChange, ...inputProps }: Props) {
  const [open, setOpen] = useState(false), [active, setActive] = useState(-1), [showAll, setShowAll] = useState(false);
  const root = useRef<HTMLDivElement>(null), input = useRef<HTMLInputElement>(null), list = useRef<HTMLUListElement>(null);
  const matches = filtrarProcedimentos(procedimentos, showAll ? "" : value);
  const visible = open && !inputProps.disabled;
  const listId = `${inputProps.id}-options`;
  const activeId = visible && matches[active] ? `${listId}-${active}` : undefined;

  useEffect(() => { setActive(-1); setShowAll(false); setOpen(false); }, [procedimentos.map(item => item.codigo).join("\u0000")]);

  useEffect(() => {
    if (visible && active >= 0) list.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, visible]);

  useEffect(() => {
    if (!visible) return;
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) {
        setOpen(false); setActive(-1);
      }
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [visible]);

  function close() { setOpen(false); setActive(-1); }
  function choose(codigo: string) {
    onValueChange(codigo);
    input.current?.focus();
    close();
  }

  return <div ref={root} className="procedure-combobox" onBlur={event => {
    // Em toque, relatedTarget pode ser null antes do click da opção. Tab e
    // pointerdown fora já fecham a lista sem desmontar esse alvo prematuramente.
    if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) close();
  }}>
    <div className="procedure-input">
      <input {...inputProps} ref={input} className="control" type="text" value={value}
        name="vitalis-medical-procedure" autoComplete="off" spellCheck={false}
        role="combobox" aria-autocomplete="list" aria-haspopup="listbox"
        aria-expanded={visible} aria-controls={visible ? listId : undefined} aria-activedescendant={activeId}
        placeholder="Buscar código ou procedimento"
        onFocus={() => { setShowAll(false); setActive(-1); setOpen(true); }}
        onChange={event => { onValueChange(event.target.value); setShowAll(false); setActive(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const count = visible ? matches.length : procedimentos.length;
            if (!visible) { setShowAll(true); setOpen(true); }
            setActive(previous => count === 0 ? -1 : event.key === "ArrowDown"
              ? (previous + 1) % count : previous <= 0 ? count - 1 : previous - 1);
          } else if (event.key === "Enter" && visible && matches[active]) {
            event.preventDefault(); choose(matches[active].codigo);
          } else if (event.key === "Escape" && visible) {
            event.preventDefault(); event.stopPropagation(); close();
          } else if (event.key === "Tab" || event.key === "Enter") close();
        }} />
      <button type="button" className="procedure-toggle" tabIndex={-1} disabled={inputProps.disabled}
        aria-label={visible ? "Fechar procedimentos" : "Mostrar procedimentos"}
        aria-expanded={visible} aria-controls={visible ? listId : undefined}
        onClick={() => {
          const wasOpen = visible;
          input.current?.focus();
          if (wasOpen) close();
          else { setShowAll(true); setActive(-1); setOpen(true); }
        }}><Icon name="chevron" size={15} /></button>
    </div>
    {visible && <div className="procedure-popup">
      <ul ref={list} id={listId} className="procedure-options" role="listbox" aria-label="Procedimentos do catálogo">
        {matches.map((item, index) => <li key={item.codigo} role="presentation">
          <button type="button" id={`${listId}-${index}`} role="option" aria-selected={index === active}
            tabIndex={-1} className="procedure-option" onClick={() => choose(item.codigo)}
            onMouseDown={event => event.preventDefault()}
            onPointerMove={event => { if (event.pointerType === "mouse") setActive(index); }}>
            <strong>{item.codigo}</strong><span>{item.descricao}</span>
          </button>
        </li>)}
      </ul>
      {matches.length === 0 && <p className="procedure-no-results" role="status">Nenhum procedimento encontrado. O código informado será mantido.</p>}
    </div>}
  </div>;
}
