/*
 * Apresentação da Sprint 7 (29/10/2026) e plano da Sprint 8.
 * Estilo de cerâmica: fundo de barro e de papel com textura, e as amostras
 * REAIS de esmalte do ateliê recortadas em círculo, como peças vistas de cima.
 */
const pptxgen = require('pptxgenjs')
const fs = require('fs')
const D = '/tmp/sl3/'
const img = (f) => 'image/' + (f.endsWith('.png') ? 'png' : 'jpeg') + ';base64,' + fs.readFileSync(D + f).toString('base64')
const LOGO = 'image/png;base64,' + fs.readFileSync('/sessions/festive-sweet-shannon/mnt/Projetos--producao-vf/docs/logo-vf.png').toString('base64')

const BARRO = '8E7150', BARRO_ESC = '5E4A35', AREIA = 'E6DFD3', TINTA = '4A4341', FRACA = '6E6563', CREME = 'EFE7DC'
const PISTACHE = '9BAA7E', SAFIRA = '3E5C76', CORAL = 'C9785D'
const TIT = 'Cambria', CORPO = 'Calibri'

const p = new pptxgen()
p.layout = 'LAYOUT_WIDE'
p.author = 'Maicon Steffen'
p.title = 'Produção VF — Sprint 7 e próximos passos'

const fundoPapel = (s) => s.addImage({ data: img('papel.jpg'), x: 0, y: 0, w: 13.33, h: 7.5 })
const fundoBarro = (s) => s.addImage({ data: img('barro.jpg'), x: 0, y: 0, w: 13.33, h: 7.5 })
const esmalte = (s, f, x, y, d) => s.addImage({ data: img(f + '.png'), x, y, w: d, h: d })
const titulo = (s, t, sub) => {
  s.addText(t, { x: 0.8, y: 0.5, w: 10.5, h: 0.7, fontFace: TIT, fontSize: 34, bold: true, color: BARRO, margin: 0 })
  if (sub) s.addText(sub, { x: 0.8, y: 1.2, w: 10.5, h: 0.4, fontFace: CORPO, fontSize: 15, color: FRACA, margin: 0 })
}
const rodape = (s, n) => {
  s.addText('Produção VF · Ateliê Vera Flesch Cerâmica', { x: 0.8, y: 6.95, w: 7, h: 0.3, fontFace: CORPO, fontSize: 10, color: FRACA, margin: 0 })
  s.addText(String(n), { x: 12.0, y: 6.95, w: 0.5, h: 0.3, fontFace: CORPO, fontSize: 10, color: FRACA, align: 'right', margin: 0 })
}
/** tigela vista de cima: anel de esmalte com o número no centro */
const tigela = (s, { x, y, d, cor, num, rot, det }) => {
  s.addShape(p.ShapeType.ellipse, { x, y, w: d, h: d, fill: { color: cor }, line: { color: cor, width: 0 } })
  s.addShape(p.ShapeType.ellipse, { x: x + d * 0.12, y: y + d * 0.12, w: d * 0.76, h: d * 0.76, fill: { color: 'FBF8F3' }, line: { color: 'FBF8F3', width: 0 } })
  s.addText(num, { x, y: y + d * 0.27, w: d, h: d * 0.3, align: 'center', fontFace: TIT, fontSize: 32, bold: true, color: TINTA, margin: 0 })
  s.addText(rot, { x: x + d * 0.15, y: y + d * 0.56, w: d * 0.7, h: d * 0.2, align: 'center', fontFace: CORPO, fontSize: 11, bold: true, color: FRACA, margin: 0 })
  if (det) s.addText(det, { x: x - 0.2, y: y + d + 0.1, w: d + 0.4, h: 0.6, align: 'center', fontFace: CORPO, fontSize: 11, color: FRACA, margin: 0 })
}
const item = (s, { x, y, w, forte, texto, cor = BARRO }) => {
  s.addShape(p.ShapeType.ellipse, { x, y: y + 0.08, w: 0.16, h: 0.16, fill: { color: cor }, line: { color: cor, width: 0 } })
  s.addText([{ text: forte + '  ', options: { bold: true, color: TINTA } }, { text: texto, options: { color: FRACA } }],
    { x: x + 0.32, y, w: w - 0.32, h: 0.7, fontFace: CORPO, fontSize: 14, margin: 0, valign: 'top' })
}
const placa = (s, { x, y, w, h, cor = AREIA }) =>
  s.addShape(p.ShapeType.roundRect, { x, y, w, h, rectRadius: 0.18, fill: { color: cor }, line: { color: cor, width: 0 } })

// 1. capa
let s = p.addSlide(); fundoBarro(s)
esmalte(s, 'pistache', 8.6, 0.6, 3.2); esmalte(s, 'pedra-sabao', 10.7, 3.2, 2.4); esmalte(s, 'azul-safira', 8.3, 4.2, 1.8); esmalte(s, 'coral', 11.6, 0.4, 1.2)
s.addImage({ data: LOGO, x: 0.8, y: 0.7, w: 1.1, h: 1.1 })
s.addText('Produção VF', { x: 0.8, y: 2.2, w: 7.5, h: 1.1, fontFace: TIT, fontSize: 56, bold: true, color: 'FFFFFF', margin: 0 })
s.addText('Sprint 7 entregue, e o que vem na Sprint 8', { x: 0.8, y: 3.3, w: 7.5, h: 0.6, fontFace: CORPO, fontSize: 21, color: CREME, margin: 0 })
placa(s, { x: 0.8, y: 4.3, w: 5.3, h: 0.5, cor: BARRO_ESC })
s.addText('MVP II · 3º entregável · 29 de outubro de 2026', { x: 1.0, y: 4.3, w: 5.1, h: 0.5, fontFace: CORPO, fontSize: 13, color: 'FFFFFF', valign: 'middle', margin: 0 })
s.addText('Maicon Steffen · IENH · ADS · Prof. Edson Inácio Wobeto\nAteliê Vera Flesch Cerâmica, Novo Hamburgo', { x: 0.8, y: 5.6, w: 7, h: 0.8, fontFace: CORPO, fontSize: 13, color: 'D9C9B4', margin: 0 })

// 2. a sprint em números
s = p.addSlide(); fundoPapel(s)
titulo(s, 'A Sprint 7 em números', 'De 25/09 a 29/10, com o sistema em uso diário no ateliê')
tigela(s, { x: 0.9, y: 1.9, d: 2.3, cor: PISTACHE, num: '6', rot: 'histórias entregues', det: 'US-56, US-57, US-70 a US-72 e US-42' })
tigela(s, { x: 3.95, y: 1.9, d: 2.3, cor: SAFIRA, num: '553', rot: 'testes de unidade', det: 'regra de negócio sem banco, ~2 s' })
tigela(s, { x: 7.0, y: 1.9, d: 2.3, cor: CORAL, num: '612', rot: 'de integração', det: 'contra um Postgres de verdade' })
tigela(s, { x: 10.05, y: 1.9, d: 2.3, cor: BARRO, num: '50', rot: 'cenários BDD', det: 'no navegador, a cada envio de código' })
placa(s, { x: 0.9, y: 5.3, w: 11.45, h: 1.25 })
s.addText([{ text: 'Zero migração nova em produção nesta sprint. ', options: { bold: true, color: TINTA } },
  { text: 'O cadastro de clientes usa a tabela que já estava no banco desde 06/09: o deploy publicou tela e API, e não mexeu em dado.', options: { color: FRACA } }],
  { x: 1.2, y: 5.4, w: 10.9, h: 1.05, fontFace: CORPO, fontSize: 15, valign: 'middle', margin: 0 })
rodape(s, 2)

// 3. clientes e fornecedores
s = p.addSlide(); fundoPapel(s)
titulo(s, 'Clientes e fornecedores', 'Pedido da Gabi em 05/09: "Auto Center", "auto center" e "AutoCenter" eram três empresas')
esmalte(s, 'branco', 9.4, 1.8, 3.2)
item(s, { x: 0.9, y: 1.95, w: 8.1, forte: 'Cola o cartão e o formulário se preenche.', texto: 'Abre o PDF da Receita, Cmd+A, cola: nome, CNPJ, endereço, telefone, porte e situação vêm prontos para conferir.', cor: PISTACHE })
item(s, { x: 0.9, y: 2.95, w: 8.1, forte: 'O mesmo cadastro não se repete.', texto: 'CNPJ igual é recusado com o nome de quem já tem; a busca acha sem acento e pelos números do documento.', cor: SAFIRA })
item(s, { x: 0.9, y: 3.95, w: 8.1, forte: 'Encomenda liga sozinha.', texto: 'O campo continua livre para quem compra uma vez; se o nome bate com um cliente cadastrado, a encomenda fica ligada a ele.', cor: CORAL })
item(s, { x: 0.9, y: 4.95, w: 8.1, forte: 'Histórico não se apaga.', texto: 'Quem tem encomenda ou matéria-prima ligada só pode ser desativado.', cor: BARRO })
rodape(s, 3)

// 4. outras entregas
s = p.addSlide(); fundoPapel(s)
titulo(s, 'O que mais saiu nesta sprint', 'Pedidos que apareceram no uso, entregues no mesmo dia ou na mesma semana')
const cards = [
  ['atacama', 'Exportar planilha', 'Histórico → movimentos do período em CSV que abre direto no Excel. Para o contador e a conferência do mês.'],
  ['vitoria-regia', 'Aplicar alvos ao cadastro', 'Um botão grava em todas as peças o mínimo que a venda dos três meses pede.'],
  ['buzios', 'Quadro mais leve', 'Coluna com cinco lotes e "mostrar mais"; menu lateral acompanha a rolagem.'],
  ['pedra-sabao', 'Versão no Início', 'Tela e API mostram o commit lado a lado: nunca mais duas semanas em branches diferentes sem ninguém ver.'],
]
cards.forEach(([e, t, d], i) => {
  const x = 0.8 + i * 3.0
  placa(s, { x, y: 1.9, w: 2.8, h: 4.6 })
  esmalte(s, e, x + 0.65, 2.15, 1.5)
  s.addText(t, { x: x + 0.2, y: 3.85, w: 2.4, h: 0.7, align: 'center', fontFace: TIT, fontSize: 17, bold: true, color: TINTA, margin: 0, valign: 'middle' })
  s.addText(d, { x: x + 0.2, y: 4.6, w: 2.4, h: 1.8, align: 'center', fontFace: CORPO, fontSize: 12.5, color: FRACA, margin: 0, valign: 'top' })
})
rodape(s, 4)

// 5. próxima sprint
s = p.addSlide(); fundoPapel(s)
titulo(s, 'Sprint 8 · o que vem', 'Duas semanas, vinte horas úteis, reserva de 25%')
placa(s, { x: 0.8, y: 1.85, w: 7.3, h: 4.7 })
s.addText('Estoque de insumo que mexe sozinho', { x: 1.1, y: 2.0, w: 6.8, h: 0.5, fontFace: TIT, fontSize: 20, bold: true, color: BARRO, margin: 0 })
const passos = [['1', 'Saldo inicial', 'a Gabi conta argila e esmalte uma vez'], ['2', 'Compra', 'cada entrada fica no histórico'], ['3', 'Consumo', 'sai sozinho quando o lote entra na etapa'], ['4', 'Contagem', 'a diferença vira ajuste registrado']]
passos.forEach(([n, t, d], i) => {
  const y = 2.7 + i * 0.92
  s.addShape(p.ShapeType.ellipse, { x: 1.1, y, w: 0.6, h: 0.6, fill: { color: BARRO }, line: { color: BARRO, width: 0 } })
  s.addText(n, { x: 1.1, y, w: 0.6, h: 0.6, align: 'center', valign: 'middle', fontFace: TIT, fontSize: 18, bold: true, color: 'FFFFFF', margin: 0 })
  s.addText([{ text: t + '  ', options: { bold: true, color: TINTA } }, { text: d, options: { color: FRACA } }], { x: 1.9, y: y + 0.05, w: 6, h: 0.5, fontFace: CORPO, fontSize: 14.5, margin: 0, valign: 'middle' })
})
s.addText('Mexe no livro-razão: passa por revisão adversarial e é o primeiro item da sprint.', { x: 1.1, y: 6.05, w: 6.8, h: 0.4, fontFace: CORPO, fontSize: 11.5, italic: true, color: FRACA, margin: 0 })
placa(s, { x: 8.4, y: 1.85, w: 4.1, h: 4.7, cor: 'DCE3D0' })
s.addText('Também na Sprint 8', { x: 8.7, y: 2.0, w: 3.6, h: 0.5, fontFace: TIT, fontSize: 18, bold: true, color: '4E5B3B', margin: 0 })
s.addText([
  { text: 'Dois papéis: gestão e produção', options: { bullet: true, breakLine: true } },
  { text: 'Perda por etapa e por peça na tela', options: { bullet: true, breakLine: true } },
  { text: 'Insumo baixo e encomenda em risco no Início', options: { bullet: true, breakLine: true } },
  { text: 'Ambiente de teste com serviço próprio', options: { bullet: true } },
], { x: 8.7, y: 2.6, w: 3.6, h: 3.6, fontFace: CORPO, fontSize: 14, color: TINTA, paraSpaceAfter: 10, valign: 'top', margin: 0 })
rodape(s, 5)

// 6. depende do ateliê
s = p.addSlide(); fundoPapel(s)
titulo(s, 'O que depende do ateliê', 'Cada resposta destrava um item da Sprint 8')
esmalte(s, 'coral', 10.2, 1.7, 2.3)
item(s, { x: 0.9, y: 1.95, w: 9.0, forte: 'Gabi: os dois papéis.', texto: 'Produção escreve só em quadro, forno, avisos, tarefas e estoque?', cor: CORAL })
item(s, { x: 0.9, y: 2.85, w: 9.0, forte: 'Gabi: a contagem inicial de cada insumo.', texto: 'Sem ela, o estoque automático nasce errado e fica errado.', cor: PISTACHE })
item(s, { x: 0.9, y: 3.75, w: 9.0, forte: 'Gabi: fechamento de setembro e outubro.', texto: 'Importar e apertar "Aplicar alvos": o planejamento passa a usar os meses novos.', cor: SAFIRA })
item(s, { x: 0.9, y: 4.65, w: 9.0, forte: 'William e Gabi: cores e tamanhos.', texto: '"Areia" virou "Pedra Sabão"? Bowl P, M e G são três peças? Decide o importador.', cor: BARRO })
item(s, { x: 0.9, y: 5.55, w: 9.0, forte: 'Equipe: ficha técnica das peças que faltam.', texto: 'A ordem de produção avisa na folha qual peça ainda não tem padrão.', cor: BARRO_ESC })
rodape(s, 6)

// 7. demonstração
s = p.addSlide(); fundoBarro(s)
s.addText('Demonstração', { x: 0.8, y: 0.6, w: 8, h: 0.8, fontFace: TIT, fontSize: 40, bold: true, color: 'FFFFFF', margin: 0 })
s.addText('producao-vf.vercel.app · o sistema que o ateliê usa todo dia', { x: 0.8, y: 1.4, w: 9, h: 0.5, fontFace: CORPO, fontSize: 16, color: CREME, margin: 0 })
const roteiro = [['pistache', 'Novo cliente', 'colando o cartão CNPJ'], ['branco', 'Encomenda', 'liga ao cliente sozinha'], ['atacama', 'Histórico', 'exportar a planilha do mês'], ['azul-safira', 'Quadro', 'dias na etapa e "mostrar mais"'], ['vitoria-regia', 'Vendas', 'alvo pela venda e aplicar'], ['pedra-sabao', 'Início', 'parados e versão publicada']]
roteiro.forEach(([e, t, d], i) => {
  const x = 0.8 + (i % 3) * 4.0, y = 2.3 + Math.floor(i / 3) * 1.55
  placa(s, { x, y, w: 3.75, h: 1.3, cor: BARRO_ESC })
  esmalte(s, e, x + 0.2, y + 0.2, 0.9)
  s.addText([{ text: `${i + 1}. ${t}\n`, options: { bold: true, color: 'FFFFFF', fontSize: 15 } }, { text: d, options: { color: CREME, fontSize: 12 } }], { x: x + 1.25, y: y + 0.15, w: 2.4, h: 1.0, fontFace: CORPO, valign: 'middle', margin: 0 })
})
placa(s, { x: 0.8, y: 5.6, w: 11.75, h: 1.1, cor: BARRO_ESC })
s.addText([{ text: '"Para o cliente está excelente."  ', options: { italic: true, color: 'FFFFFF' } }, { text: 'O próximo passo é o estoque de insumo andar sozinho, que é onde ainda se conta de cabeça.', options: { color: 'D9C9B4' } }],
  { x: 1.1, y: 5.65, w: 11.2, h: 1.0, fontFace: CORPO, fontSize: 15, valign: 'middle', margin: 0 })
s.addImage({ data: LOGO, x: 11.75, y: 0.6, w: 0.8, h: 0.8 })

p.writeFile({ fileName: process.argv[2] }).then((f) => console.log('gerado', f))
