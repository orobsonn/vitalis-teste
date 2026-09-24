/**
 * Fila de exclusão mútua para as seções de banco da orquestração.
 *
 * O adaptador D1 de teste abre uma transação real (`BEGIN ... COMMIT`) em
 * `DB.batch`; dois batches concorrentes sobre a MESMA conexão falhariam com
 * "cannot start a transaction within a transaction". A fila serializa apenas as
 * seções de banco de cada chamada, nunca a chamada inteira: as portas
 * semânticas (`conferir`) rodam FORA da seção crítica, permitindo que dois
 * workers reivindiquem linhas distintas e segurem a porta em paralelo — o
 * fence/lease é justamente exercitado assim.
 */

let cadeia: Promise<void> = Promise.resolve();

/** Executa `tarefa` após a seção anterior terminar, preservando o resultado/erro. */
export function serializar<T>(tarefa: () => Promise<T>): Promise<T> {
  const iniciar = (): Promise<T> => tarefa();
  const resultado = cadeia.then(iniciar, iniciar);
  // A cadeia nunca rejeita: uma seção com erro é observada pelo chamador, mas
  // não impede as próximas de rodarem.
  cadeia = resultado.then(
    () => undefined,
    () => undefined,
  );
  return resultado;
}
