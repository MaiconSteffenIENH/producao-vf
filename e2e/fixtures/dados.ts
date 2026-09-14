/** nomes únicos por cenário: o banco é um só para a bateria inteira */
let contador = 0
export function nomeUnico(base: string): string {
  contador++
  const carimbo = Date.now().toString(36).slice(-5).toUpperCase()
  return `${base} E2E ${carimbo}${contador}`.toUpperCase()
}

/** AAAA-MM-DD do dia do ateliê (UTC-3), deslocado em `dias` */
export function diaDoAtelie(dias = 0): string {
  const agora = new Date(Date.now() - 3 * 3600 * 1000 + dias * 86_400_000)
  return agora.toISOString().slice(0, 10)
}
/** dd/mm a partir de AAAA-MM-DD */
export function ddmm(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
}
/** o próximo dia da semana pedido (0 = domingo … 6 = sábado), estritamente depois de hoje no ateliê */
export function proximo(diaDaSemana: number): string {
  for (let d = 1; d <= 7; d++) {
    const iso = diaDoAtelie(d)
    const dow = new Date(`${iso}T12:00:00Z`).getUTCDay()
    if (dow === diaDaSemana) return iso
  }
  throw new Error('impossível')
}

/** regex que casa o nome da peça no plural do sistema ("BOWL X" vira "BOWLS X": só a primeira palavra flexiona) */
export function nomeNoPlural(nome: string): string {
  const [cabeca, ...resto] = nome.split(' ')
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return `${esc(cabeca)}\\w*${resto.length ? ' ' + esc(resto.join(' ')) : ''}`
}
