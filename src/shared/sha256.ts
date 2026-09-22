/**
 * SHA-256 puro em TypeScript, sem dependências e sem I/O.
 *
 * A entrada é sempre um texto UTF-8; os oito blocos de estado são processados
 * com aritmética de 32 bits (`>>> 0`) para não depender de `BigInt` nem de
 * qualquer biblioteca externa.
 */

const CONSTANTES_K: readonly number[] = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

const ESTADO_INICIAL: readonly number[] = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

function rotacionarDireita(valor: number, bits: number): number {
  return ((valor >>> bits) | (valor << (32 - bits))) >>> 0;
}

/** Codifica um texto como bytes UTF-8 (sem BOM, sem normalização). */
export function codificarUtf8(texto: string): Uint8Array {
  const bytes: number[] = [];
  for (const caractere of texto) {
    const ponto = caractere.codePointAt(0) ?? 0;
    if (ponto < 0x80) {
      bytes.push(ponto);
    } else if (ponto < 0x800) {
      bytes.push(0xc0 | (ponto >> 6), 0x80 | (ponto & 0x3f));
    } else if (ponto < 0x10000) {
      bytes.push(0xe0 | (ponto >> 12), 0x80 | ((ponto >> 6) & 0x3f), 0x80 | (ponto & 0x3f));
    } else {
      bytes.push(
        0xf0 | (ponto >> 18),
        0x80 | ((ponto >> 12) & 0x3f),
        0x80 | ((ponto >> 6) & 0x3f),
        0x80 | (ponto & 0x3f),
      );
    }
  }
  return Uint8Array.from(bytes);
}

function resumirBytes(dados: Uint8Array): string {
  const estado = [...ESTADO_INICIAL];
  const blocos = Math.ceil((dados.length + 9) / 64);
  const mensagem = new Uint8Array(blocos * 64);
  mensagem.set(dados);
  mensagem[dados.length] = 0x80;

  const comprimentoBits = dados.length * 8;
  const visao = new DataView(mensagem.buffer, mensagem.byteOffset, mensagem.byteLength);
  visao.setUint32(blocos * 64 - 8, Math.floor(comprimentoBits / 0x100000000), false);
  visao.setUint32(blocos * 64 - 4, comprimentoBits >>> 0, false);

  const agenda = new Uint32Array(64);
  for (let bloco = 0; bloco < blocos; bloco += 1) {
    const base = bloco * 64;
    for (let indice = 0; indice < 16; indice += 1) {
      agenda[indice] = visao.getUint32(base + indice * 4, false);
    }
    for (let indice = 16; indice < 64; indice += 1) {
      const anterior15 = agenda[indice - 15]!;
      const anterior2 = agenda[indice - 2]!;
      const sigma0 = rotacionarDireita(anterior15, 7) ^ rotacionarDireita(anterior15, 18) ^ (anterior15 >>> 3);
      const sigma1 = rotacionarDireita(anterior2, 17) ^ rotacionarDireita(anterior2, 19) ^ (anterior2 >>> 10);
      agenda[indice] = (agenda[indice - 16]! + sigma0 + agenda[indice - 7]! + sigma1) >>> 0;
    }

    let a = estado[0]!;
    let b = estado[1]!;
    let c = estado[2]!;
    let d = estado[3]!;
    let e = estado[4]!;
    let f = estado[5]!;
    let g = estado[6]!;
    let h = estado[7]!;

    for (let indice = 0; indice < 64; indice += 1) {
      const soma1 = rotacionarDireita(e, 6) ^ rotacionarDireita(e, 11) ^ rotacionarDireita(e, 25);
      const escolha = (e & f) ^ (~e & g);
      const temp1 = (h + soma1 + escolha + CONSTANTES_K[indice]! + agenda[indice]!) >>> 0;
      const soma0 = rotacionarDireita(a, 2) ^ rotacionarDireita(a, 13) ^ rotacionarDireita(a, 22);
      const maioria = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (soma0 + maioria) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    estado[0] = (estado[0]! + a) >>> 0;
    estado[1] = (estado[1]! + b) >>> 0;
    estado[2] = (estado[2]! + c) >>> 0;
    estado[3] = (estado[3]! + d) >>> 0;
    estado[4] = (estado[4]! + e) >>> 0;
    estado[5] = (estado[5]! + f) >>> 0;
    estado[6] = (estado[6]! + g) >>> 0;
    estado[7] = (estado[7]! + h) >>> 0;
  }

  return estado.map((palavra) => palavra.toString(16).padStart(8, "0")).join("");
}

/** Digest SHA-256 em hexadecimal minúsculo de um texto UTF-8. */
export function sha256Hex(texto: string): string {
  return resumirBytes(codificarUtf8(texto));
}
