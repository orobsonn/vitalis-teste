import { useEffect, useRef, type ReactNode } from "react";
import { COLUNAS_GUIA, type ColunaGuia, type GuiaOriginal } from "../domain/contratos";
import { valorParaCentavos } from "../domain/dinheiro";

export const campos: Record<ColunaGuia, string> = {
  id_guia: "Identificação da guia", unidade: "Unidade", data_atendimento: "Data do atendimento", paciente: "Paciente", convenio: "Convênio", carteirinha: "Carteirinha", cid: "CID", procedimento_codigo: "Código do procedimento", procedimento_descricao: "Descrição do procedimento", numero_autorizacao: "Número da autorização", autorizacao_validade: "Validade da autorização", autorizacao_sessoes_limite: "Limite de sessões da autorização", sessao_numero_na_autorizacao: "Número da sessão", profissional: "Profissional", profissional_registro: "Registro profissional", valor: "Valor da guia (R$)", observacao_recepcao: "Observação da recepção", data_lancamento: "Data de lançamento",
};
const rotulos: Record<string, string> = {
  convenio_ausente: "Convênio não informado", convenio_nao_catalogado: "Convênio não catalogado", procedimento_ausente: "Procedimento não informado", procedimento_nao_catalogado: "Procedimento não catalogado", procedimento_sem_cobertura: "Procedimento sem cobertura", procedimento_descricao_divergente: "Descrição divergente", campo_obrigatorio_ausente: "Dado obrigatório ausente", data_invalida: "Data inválida", campo_numerico_invalido: "Número inválido", valor_ilegivel: "Valor ilegível", profissional_registro_invalido: "Registro profissional inválido", autorizacao_vencida: "Autorização vencida", sessao_acima_do_limite: "Limite de sessões excedido", prazo_envio_excedido: "Prazo de envio excedido", cronologia_incoerente: "Datas incoerentes", valor_divergente_da_referencia: "Valor diferente da referência", autorizacao_nova_nao_cadastrada: "Nova autorização não cadastrada", autorizacao_verbal_sem_numero: "Autorização verbal sem número", modalidade_particular_contraditoria: "Cobrança particular indicada", procedimento_realizado_divergente: "Procedimento realizado divergente", conferencia_humana_especifica: "Conferência humana necessária", checagem_textual_incompleta: "Checagem textual incompleta", duplicidade_grupo_candidato: "Possível duplicidade", duplicidade_potencial: "Possível duplicidade", possivel_duplicidade: "Possível duplicidade", duracao_maxima_autorizacao_nao_verificavel: "A duração máxima da autorização não pode ser verificada sem a data de emissão.", prazo_como_politica_do_exercicio: "O prazo considera dias corridos, conforme a política do exercício.", valor_fora_das_somas: "O valor ilegível desta guia não entra nas somas.", prazo_nao_verificavel: "Não foi possível verificar o prazo com as datas disponíveis.", sessao_nao_verificavel: "O número da sessão não foi informado ou não pôde ser interpretado.", limite_sessoes_nao_verificavel: "Não foi possível verificar o limite de sessões.", cobertura_indefinida: "Não foi possível definir a cobertura com os dados disponíveis.", checagem_textual_indisponivel: "A observação precisa de conferência humana.", soma_de_valores_nao_verificavel: "O total excede a faixa de cálculo seguro.",
};
export const rotulo = (value: string) => rotulos[value] ?? value.replaceAll("_", " ");
export const dinheiro = (value: number | null | undefined) => value == null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value / 100);
export const valorGuia = (guia: GuiaOriginal) => dinheiro(valorParaCentavos(guia.valor));
export const dataCurta = (value?: string | null) => !value ? "—" : /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10).split("-").reverse().join("/") : value;
export const dataHora = (value?: string | null) => value ? new Date(value).toLocaleString("pt-BR") : "—";
export function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const paths: Record<string, ReactNode> = {
    overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    guides: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
    plus: <path d="M12 5v14M5 12h14" />,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5" /></>,
    rules: <><path d="M4 4h6a2 2 0 0 1 2 2v15a4 4 0 0 0-4-2H4zm16 0h-6a2 2 0 0 0-2 2v15a4 4 0 0 1 4-2h4z" /></>,
    connection: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m9 9-3 3 3 3m6-6 3 3-3 3" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v.1" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    chevron: <path d="m9 5 7 7-7 7" />,
    close: <path d="m6 6 12 12M18 6 6 18" />,
    refresh: <><path d="M20 8a9 9 0 1 0 1 8M20 3v6h-6" /></>,
    file: <><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Zm0 0v6h6M8 13h8M8 17h5" /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] ?? paths.info}</svg>;
}
export function Badge({ value }: { value: string }) {
  const labels: Record<string, string> = { CONCLUIDO: "Concluído", PROCESSANDO: "Processando", PARCIAL: "Concluído com falhas", FALHOU: "Falha", PROCESSADO: "Concluída", REAPROVEITADO: "Reaproveitada", PENDENTE: "PENDENTE", EM_ANDAMENTO: "Em andamento" };
  const cls = ["OK", "CONCLUIDO", "PROCESSADO", "REAPROVEITADO"].includes(value) ? "ok" : value === "FALHOU" ? "error" : ["PROCESSANDO", "EM_ANDAMENTO"].includes(value) ? "running" : "pending";
  return <span className={`badge ${cls}`}>{labels[value] ?? value}</span>;
}
export function Notice({ children, error = false }: { children: ReactNode; error?: boolean }) {
  return <div className={`notice ${error ? "notice-error" : ""}`} role={error ? "alert" : undefined}><Icon name="info" /><div>{children}</div></div>;
}
export function Metric({ label, value, caption, tone = "" }: { label: string; value: ReactNode; caption?: string; tone?: string }) {
  return <article className="card metric"><div className="metric-label">{label}</div><div className={`metric-value ${tone}`}>{value}</div>{caption && <div className="metric-caption">{caption}</div>}</article>;
}
export function Modal({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog className={`modal ${wide ? "modal-wide" : ""}`} ref={ref} aria-label={title} onCancel={onClose} onClick={(event) => { if (event.target === event.currentTarget) { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) onClose(); } }}><header className="modal-header"><h2>{title}</h2><button className="icon-button" aria-label="Fechar" title="Fechar" onClick={onClose}><Icon name="close" /></button></header><div className="modal-body">{children}</div></dialog>;
}
export function CsvFormat({ onClose }: { onClose: () => void }) {
  function download() { const url = URL.createObjectURL(new Blob(["\uFEFF" + COLUNAS_GUIA.join(",") + "\n"], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = "modelo-guias-vitalis.csv"; link.click(); URL.revokeObjectURL(url); }
  return <Modal title="Formato esperado do CSV" onClose={onClose}><p>Use as 18 colunas abaixo, separadas por vírgula, com o cabeçalho na primeira linha. Preserve os nomes e a ordem. Datas aceitam DD/MM/AAAA ou AAAA-MM-DD; valores aceitam 120,00 ou 120.00.</p><div className="code-block">{COLUNAS_GUIA.join(",")}</div><p className="muted">O arquivo deve estar em UTF-8. Valores com vírgula decimal devem estar entre aspas. Campos vazios continuam vazios; a conferência explica as pendências.</p><button className="btn primary" onClick={download}><Icon name="file" />Baixar modelo CSV</button></Modal>;
}
