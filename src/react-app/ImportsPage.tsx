import { useEffect, useRef, useState } from "react";
import { api, mensagemErro, type Importacao, type ImportacaoResposta } from "./api";
import { postImportMutation } from "./import-request";
import { Badge, Icon, Metric, Notice, dataHora } from "./ui";
import type { LinhaImportacao } from "../storage/contratos";
import type { GuiaOriginal } from "../domain/contratos";

export function ImportsPage({ importacoes, onRefresh, onOpen, onFormat }: { importacoes: Importacao[]; onRefresh: () => Promise<void>; onOpen: (id: string) => void; onFormat: () => void }) {
  const [selected, setSelected] = useState<ImportacaoResposta | null>(null); const [filename, setFilename] = useState(""); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [filter, setFilter] = useState(""); const [search, setSearch] = useState(""); const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null); const controller = useRef<AbortController | null>(null); const key = useRef(crypto.randomUUID());
  useEffect(() => {
    let active = true;
    // A navegação interrompe o loop local e as leituras, sem abortar o POST em voo.
    // Ao voltar, recupere o histórico para oferecer a retomada sem exigir reload.
    void onRefresh().catch((error) => { if (active) setError(mensagemErro(error)); });
    return () => { active = false; controller.current?.abort(); };
  }, [onRefresh]);
  function pick(next?: File) { if (!next) return; setError(""); if (!next.name.toLowerCase().endsWith(".csv")) { setError("Selecione um arquivo com extensão .csv."); return; } if (next.size > 50 * 1024) { setError("O arquivo deve ter até 50 KB. Divida o lote em arquivos menores."); return; } setFile(next); setFilename(next.name); setSelected(null); key.current = crypto.randomUUID(); }
  async function process(initial: ImportacaoResposta, signal: AbortSignal) {
    let current = initial;
    while (current.lote.status === "PROCESSANDO" && !signal.aborted) {
      const next = await postImportMutation<ImportacaoResposta>(`/api/importacoes/${encodeURIComponent(current.lote.id)}/processar`, {}, signal);
      if (!next || signal.aborted) return;
      current = next;
      setSelected((previous) => ({ ...next, linhas: next.linhas ?? previous?.linhas }));
      const detail = await api<ImportacaoResposta>(`/api/importacoes/${encodeURIComponent(current.lote.id)}`, undefined, signal);
      if (signal.aborted) return;
      current = detail; setSelected(detail);
    }
    if (!signal.aborted) {
      if (!current.linhas) {
        const detail = await api<ImportacaoResposta>(`/api/importacoes/${encodeURIComponent(current.lote.id)}`, undefined, signal);
        if (signal.aborted) return;
        setSelected(detail);
      }
      await onRefresh();
    }
  }
  async function start() {
    if (!file || busy) return;
    setBusy(true); setError(""); controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    try { const csv = await file.text(); if (abort.signal.aborted) return; const response = await postImportMutation<ImportacaoResposta>("/api/importacoes", { csv, arquivo_nome: file.name, idempotency_key: key.current }, abort.signal); if (!response || abort.signal.aborted) return; setSelected(response); await process(response, abort.signal); }
    catch (error) { if (!abort.signal.aborted) setError(mensagemErro(error)); } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  async function open(item: Importacao, resume = false) {
    if (busy) return;
    setBusy(true); setError(""); setFilename(item.arquivoNome ?? "Arquivo CSV"); setFile(null); controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    try { const response = await api<ImportacaoResposta>(`/api/importacoes/${encodeURIComponent(item.id)}`, undefined, abort.signal); if (abort.signal.aborted) return; setSelected(response); if (resume) await process(response, abort.signal); }
    catch (error) { if (!abort.signal.aborted) setError(mensagemErro(error)); } finally { if (!abort.signal.aborted) setBusy(false); }
  }
  function original(line: LinhaImportacao): Partial<GuiaOriginal> { try { return line.originalJson ? JSON.parse(line.originalJson) as GuiaOriginal : {}; } catch { return {}; } }
  const progresso = selected?.progresso ?? selected?.lote.progresso;
  const finished = progresso ? progresso.processadas + progresso.reaproveitadas + progresso.comFalha : 0;
  const percentage = progresso?.encontradas ? Math.round(finished / progresso.encontradas * 100) : selected?.lote.status === "CONCLUIDO" ? 100 : 0;
  const lines = (selected?.linhas ?? []).filter((line) => (!filter || line.estado === filter) && (!search || `${original(line).id_guia ?? ""} ${original(line).paciente ?? ""}`.toLowerCase().includes(search.toLowerCase())));
  return <><div className="page-header"><div><h1>{busy && selected ? "Importando guias" : "Importações"}</h1><p>Envie o CSV e acompanhe o resultado de cada linha, inclusive falhas parciais.</p></div><div className="actions"><button className="btn" onClick={onFormat}>Ver formato esperado</button>{selected && <button className="btn" disabled={busy} onClick={() => { setSelected(null); setFile(null); if (input.current) input.current.value = ""; }}>Selecionar outro arquivo</button>}</div></div>{error && <Notice error>{error}{selected?.lote.status === "PROCESSANDO" && " O progresso foi preservado. Use Retomar processamento para continuar."}</Notice>}<input ref={input} type="file" accept=".csv,text/csv" className="sr-only" aria-label="Selecionar arquivo CSV" onChange={(e) => pick(e.target.files?.[0])} disabled={busy} />{!selected && <article className={`card upload-zone ${dragging ? "dragging" : ""}`} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); if (!busy) pick(e.dataTransfer.files[0]); }}><div className="empty-icon"><Icon name={file ? "file" : "upload"} size={28} /></div><h2>{file ? file.name : "Importe seu arquivo de guias"}</h2><p>{file ? `${(file.size / 1024).toFixed(1)} KB · pronto para conferência` : "Arraste o CSV até aqui ou selecione um arquivo no computador."}</p><div className="actions"><button className="btn" disabled={busy} onClick={() => input.current?.click()}>{file ? "Trocar arquivo" : "Selecionar CSV"}</button>{file && <button className="btn primary" disabled={busy} onClick={() => void start()}>{busy ? "Registrando lote…" : "Importar e conferir"}</button>}</div><p className="hint">CSV em UTF-8 · 18 colunas · até 50 KB</p></article>}{selected && progresso && <><article className="card"><div className="import-head"><div className="file"><div className="file-icon"><Icon name="file" size={26} /></div><div><strong>{selected.lote.arquivoNome ?? filename}</strong><span>Lote {selected.lote.id.slice(0, 12)} · upload manual</span></div></div><Badge value={selected.lote.status} /></div><div className="progress-area"><div className="progress-top"><strong>{selected.lote.status === "PROCESSANDO" ? "Conferindo guias" : "Conferência finalizada"}</strong><span>{percentage}%</span></div><progress max={100} value={percentage} aria-label="Progresso da importação" /><div className="progress-foot"><span>Linhas concluídas ficam disponíveis imediatamente</span><span>{finished} de {progresso.encontradas} linhas</span></div>{!busy && selected.lote.status === "PROCESSANDO" && <button className="btn primary resume" onClick={() => void open(selected.lote, true)}><Icon name="refresh" />Retomar processamento</button>}</div></article><section className="metrics import-metrics"><Metric label="Linhas encontradas" value={progresso.encontradas} /><Metric label="Processadas" value={progresso.processadas + progresso.reaproveitadas} tone="green" caption={`${progresso.reaproveitadas} reaproveitadas`} /><Metric label="Em andamento" value={progresso.pendentes + progresso.emAndamento} /><Metric label="Falhas de entrada" value={progresso.comFalha} tone={progresso.comFalha ? "red" : ""} /></section><article className="card"><div className="card-head"><div><h2>Linhas do arquivo</h2><p>Acompanhe o resultado sem esconder falhas parciais.</p></div><div className="actions"><select className="control" aria-label="Status da linha" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">Status: todos</option><option value="PROCESSADO">Concluída</option><option value="REAPROVEITADO">Reaproveitada</option><option value="PENDENTE">Aguardando</option><option value="EM_ANDAMENTO">Em andamento</option><option value="FALHOU">Falha</option></select><input className="control" placeholder="Buscar guia ou paciente" aria-label="Buscar linha" value={search} onChange={(e) => setSearch(e.target.value)} /></div></div><div className="table-wrap"><table><thead><tr><th>Linha</th><th>Guia</th><th>Convênio</th><th>Procedimento</th><th>Processamento</th><th>Detalhe</th></tr></thead><tbody>{lines.map((line) => { const guia = original(line); return <tr key={line.id}><td>{line.numeroLinha}</td><td>{guia.id_guia || "—"}</td><td>{guia.convenio || "—"}</td><td>{guia.procedimento_codigo || "—"}</td><td>{line.estado === "PENDENTE" ? <span className="badge neutral">Aguardando</span> : <Badge value={line.estado} />}</td><td className="line-detail">{line.motivo || (line.guiaId ? <button className="text-button" onClick={() => onOpen(line.guiaId!)}>Ver resultado</button> : "Aguardando conferência")}</td></tr>; })}{!lines.length && <tr><td className="table-empty" colSpan={6}>{selected.linhas ? "Nenhuma linha para estes filtros." : "O progresso está disponível. Os detalhes das linhas serão atualizados durante a conferência."}</td></tr>}</tbody></table></div></article><Notice>Uma linha inválida não apaga as guias válidas. Falhas de entrada ficam separadas dos itens registrados e precisam ser corrigidas e reenviadas.</Notice></>}{importacoes.length > 0 && <article className="card past-imports"><div className="card-head"><div><h2>Histórico de importações</h2><p>Abra um lote para consultar suas linhas ou retomar a conferência.</p></div></div><div className="table-wrap"><table><thead><tr><th>Arquivo</th><th>Iniciado em</th><th>Linhas</th><th>Status</th><th><span className="sr-only">Ação</span></th></tr></thead><tbody>{importacoes.map((item) => <tr key={item.id}><td>{item.arquivoNome ?? item.id.slice(0, 12)}</td><td>{dataHora(item.iniciadoEm)}</td><td>{item.linhasEncontradas}</td><td><Badge value={item.status} /></td><td><button className="text-button" disabled={busy} onClick={() => void open(item, item.status === "PROCESSANDO")}>{item.status === "PROCESSANDO" ? "Retomar processamento" : "Ver lote"}</button></td></tr>)}</tbody></table></div></article>}</>;
}
