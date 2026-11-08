// Utilidades de texto usadas depois da geração.

/**
 * Corrige palavra que o modelo escreveu com a caixa misturada no meio de um texto em
 * caixa alta (aconteceu mais de uma vez: "ENSaiAMOS"). Só mexe em palavra que já tem
 * pelo menos duas maiúsculas E alguma minúscula: "e-mail", "Rafael" e "de" ficam como
 * estão.
 */
const CAIXA_MISTA = /(?<!\p{L})(?=\p{L}*\p{Lu}\p{L}*\p{Lu})(?=\p{L}*\p{Ll})\p{L}+(?!\p{L})/gu;

export function corrigirCaixaMista(texto: string): string {
  return texto.replace(CAIXA_MISTA, (p) => p.toLocaleUpperCase("pt-BR"));
}
