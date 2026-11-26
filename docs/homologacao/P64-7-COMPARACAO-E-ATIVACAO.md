# P64.7 · comparação e ativação

A base é `e02b17f6c5183e78700c23d0f97f099720a6e567`. As 76 imagens
estão disponíveis na conversa em que foram enviadas. A cópia de trabalho
contém a [matriz numerada das 76 referências](P64-6-MATRIZ-VISUAL.md).
As imagens originais não estão armazenadas na cópia de trabalho. A comparação
usa a interface visível nas referências, e as capturas publicadas usam
cadastros e movimentos fictícios.

| Tela | Referências | P64.6 | P64.7 |
|---|---|---|---|
| Mesas e comandas | 16, 39, 40 | Grade já separada por estados | A seleção abre o atendimento na página. A busca sem correspondências pode ser limpa, e a seleção pode alternar para o tipo de atendimento que tem cadastros. |
| Atendimento | 2, 3, 10, 11, 22, 43, 69, 76 | Janela flutuante, catálogo inicialmente recolhido | Área de trabalho em tela inteira. Identificação, catálogo e comanda têm painéis próprios, com busca F3, rodapé operacional e opções secundárias em menu. |
| Pagamento | 32, 38, 47, 56–58, 61–62 | Métodos verticais e resumo lateral em largura maior | A faixa de recebimento prioriza total, saldo, recebido e troco. Desconto, serviço e subtotal compõem a memória de cálculo. |
| Divisão | 48, 56, 62 | Seleção e resultado empilhados | Seleção de clientes e itens com resumo e comando de recebimento em painel próprio em telas largas. |
| Balcão e caixa | 8, 19, 49 | Cartão de venda lateral e painéis de turno em sequência | Balcão com catálogo, itens e faixa de conclusão. O caixa põe o movimento em paralelo à conferência, sangria, suprimento e fechamento. |
| Estoque e compras | 13–14, 26, 29, 66 | Indicadores e planejamento antecediam a grade | A consulta de insumos e as abas são a área principal. Posição e planejamento ficam ao lado quando há espaço. A busca trabalha sobre os insumos cadastrados. |
| Painel gerencial | Movimento, metas e alertas | Metas e relatórios do período antecediam os indicadores diários | Indicadores diários no topo, gráficos de vendas em paralelo a metas e estoque crítico, com resumo do período e contas agrupados abaixo. |

O job Chromium da [auditoria visual](https://github.com/paulobhzt-tech/Apollo/actions?query=branch%3Afeat%2Fp64-7-reconstrucao-completa-interface-consumer)
gera os pares `p646-*` e `p647-*` com o mesmo conjunto de cenários e bases
descartáveis separadas. A P64.6 é compilada do commit de referência. As
capturas anteriores também estão na [execução da P64.6](https://github.com/paulobhzt-tech/Apollo/actions/runs/45843204382).

## Diferenças e aceite

- O Consumer usa uma janela de atendimento. O Apollo ocupa a área de trabalho
  e conserva o pedido visível ao navegar pelo catálogo no desktop.
- Transferência e junção têm diálogos próprios. Permanecem pendentes mudança
  de canal e recálculo administrativo equivalente às referências.
- A divisão calcula e recebe itens selecionados, podendo partir do cliente
  responsável. Dividir por percentual, pessoas ou valor na pré-conta e no
  pagamento continua um cálculo auxiliar. Transferência contábil de saldo e
  baixa contábil autônoma desses tipos seguem pendentes.
- Relatórios detalhados, menu de módulos, KDS e módulos comerciais continuam com a
  arquitetura anterior. A revisão integral dessas interfaces e a conciliação
  externa com os provedores seguem pendentes.
- O indicador por item distingue aceitação pelo spooler e confirmação
  registrada pelo operador. O ensaio físico deve conferir o papel.

O proprietário decide o aceite visual. A comparação usa dados fictícios e
o ensaio de carga deve permanecer fora da VPS de homologação.

## Instalação isolada e rollback

1. Identifique o SHA, a porta de loopback, a imagem, os volumes e as redes da
   P64.6 instalada. Preserve a configuração de autenticação adicional, o
   manifesto e um backup verificado da instância anterior.
2. Confira o SHA-256 do pacote Docker e do Web/PWA. Em laboratório, importe as
   imagens e ensaie o retorno à P64.6 usando MongoDB descartável. O pacote
   deve conter as duas imagens e as evidências de reinício e rollback.
3. Com autorização de implantação, use um projeto, porta, rede, credenciais e
   banco próprios para a candidata. Confira o isolamento e o bloqueio externo
   antes de iniciar. Valide HTTPS, autenticação adicional, impressão e
   recuperação após reinício com cargas leves.
4. Preserve a P64.6 ativa até a autorização de troca. Se houver falha após a
   troca, volte o encaminhamento ao ambiente P64.6 preservado e confirme
   o SHA servido, a API e a autenticação.
5. Execute o [roteiro físico](P64-6-ROTEIRO-OPERACIONAL.md), com foco em
   Windows, Android, iPhone e conferência das vias no papel. A restauração no
   destino externo real segue o [procedimento de backup](../../deploy/vps/README.md).

A validação do Print Agent sob a autenticação adicional e o ensaio no
armazenamento de backup real dependem de acesso administrativo autorizado.
