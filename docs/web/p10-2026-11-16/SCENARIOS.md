# P10.2 — matriz de cenários e evidência

Aplicação/infraestrutura final: `526dd72b78d57b7799fc995af42e0fe925c04379`. Fonte: workflow P10 principal e artefatos identificados em [REVIEW.json](evidence/REVIEW.json), com hashes e resultados por projeto. Cada caso P10 abaixo roda em desktop, notebook, tablet e mobile; 15 casos por projeto, porque P10-12 tem dois processos. Dados fictícios reinicializados entre testes: estoque e lote 1.000, produto R$10, receita de uma unidade. Sem liquidação PIX/cartão ou transmissão fiscal.

Os resultados desta matriz somente são considerados finais quando o REVIEW registra a conclusão dessa execução. API real a partir do browser significa `page.request` autenticado contra FastAPI/Mongo; não significa clique completo na tela daquele módulo. P5 tem simulações próprias e sua evidência é separada.

| Cenário solicitado | Caso e modo | Resultado esperado | Observado nos ensaios |
|---|---|---|---|
| Autenticação, sessão, permissões | P10-01; UI login, API de segurança; P6 entre abas | Cookie seguro, reload autenticado, expiração/logout 401, perfil mínimo e CSRF/CORS hostis negados | Cookie HttpOnly/Secure; reload 200; sessão expirada/logout 401; funcionários e integrações 403; sem CORS para origem hostil |
| Cadastro/edição de produtos | P10-02; API e listagem UI | Criar e editar preço, conservar receita; garçom não escreve | Produto de 12 para 14, receita conservada e visível na lista; gravações de garçom 403 |
| Insumos e receitas | P10-02; API real | Insumo novo e receita associada | Insumo com estoque 40, produto com receita de duas unidades; receita retornada coincide |
| Controle de estoque | P10-03 a 10/12; snapshots Mongo | Baixa e estorno compatíveis com receita/lote, nenhuma duplicação | Todos os snapshots P10: estoque = lote = 1.000 + movimentos; referências/números únicos |
| Abertura/fechamento de caixa | P10-03; abertura UI, fechamento API | Abrir 100, vender dinheiro 10, fechar 110 sem diferença | Caixa fechado: venda 10, contado/esperado 110, diferença 0 |
| Venda de balcão | P10-03; checkout UI real | Uma venda 10, baixa 1, um marcador/ticket | Uma ordem paga, estoque/lote 999, um marcador e ticket |
| Mesas/comandas e QR | P10-04; API real | Duas contas pagas e QR repetido debitando só uma vez | Três ordens, duas pagas; estoque/lote 997; repetição QR não duplica |
| Pedidos para cozinha | P10-03; visualização UI e API KDS | Ticket visível e transição preparo/pronto | Produto visível em KDS; transições 200; um ticket. Não certifica papel |
| Delivery fictício | P10-05; API pública e autenticada | Não baixar antes de aceitar; aceitar/entregar; cancelar devolvendo | Estoque 1.000 → 999 → 1.000; ordem cancelada, DTO sem custo/receita |
| Cancelamento, estorno parcial/total, autorização | P10-06; API/PIN | Caixa sem PIN ou PIN inválido negado; devolução exata com gerente | 403 sem autorização; parcial 10, saldo da ordem 10, depois cancelamento; estoque/lote final 1.000, movimentos -2/+1/+1 |
| Fiado/contas financeiras | P10-07/13; API real | Dívida 10 e reversão 0; conta 7 paga uma vez | Fiado 10 → 0 e estoque 1.000; segunda quitação da conta 400, um registro com pago 7 |
| Relatórios de vendas/caixa | P10-03; API real | Caixa e dashboard reconciliados | Receita do dia 10 e uma ordem; caixa venda 10 e diferença 0; cashflow responde |
| Repetição financeira/concorrência | P10-08; dez requisições concorrentes por operação | Mesma referência produz um ID; cancelamento concorrente devolve uma vez | Um ID/marcador no primeiro grupo; estoque 999 → 1.000; commit incerto de outra venda preserva duas ordens totais, estoque 999 |
| Falha durante confirmação | P10-09 e P6; failpoint Mongo real | Falha pré-commit não confirma parte de venda/estoque | 503 exigido; zero ordens/marcadores, estoque/lote 1.000; sem replay automático |
| Rede offline e refresh | P10-09/10 e P6; UI, corte de rede/resposta real | Browser offline sem fila; resposta perdida pós-commit reconciliável após reload | Nenhuma fila offline; resposta abortada após commit mantém uma ordem/marcador e estoque 999; não reenvia venda |
| Reinício backend | P10-12 backend; SIGKILL/restart controlado pelo harness | Readiness recupera e mesma referência retorna o ID anterior | Um ID, uma ordem/marcador, estoque/lote 999 após recuperação |
| Falha/recuperação Mongo | P10-12 mongo; reinício real + failover de três membros | Persistir venda e evitar duplicação; nova eleição com escrita única | Replay devolve mesmo ID e estoque 999; failover separado registra eleição, saldo 90 e um movimento |
| Acesso não autorizado/escalonamento | P10-01/02/06, P6, backend | Backend deve negar mesmo usando API diretamente | 401/403 esperados; garçom/cozinha não ganham privilégio financeiro por navegação |
| Orçamento de chamadas públicas | P10-14; 61 chamadas simultâneas | 60 admitidas, uma 429, nenhum efeito financeiro | 60 respostas 200 e uma 429; zero ordens e estoque 1.000 |
| Bootstrap/limite login | Backend real e Docker | Sem padrão previsível; provisionar uma vez; reservar orçamento atomicamente | Dois bootstraps: um sucesso/um 409; 20 reservas login: 5 admitidas/15 negadas |
| Backup/restauração | Backend real, destino separado | Backup sem segredos/markers e restore sem sobrescrever identidade local | Venda restaurada, estoque 99 na fixture específica, markers e admin locais preservados |
| Responsividade/acessibilidade | P10-11; UI/teclado/axe | Sem overflow global; login/PDV/caixa sem violações ou verificações incompletas | Consultar 12 relatórios axe no REVIEW final; screenshots por viewport no artefato |
| Docker/HTTPS/isolamento | Smoke em runner, Nginx real | TLS verificado, servir dist-web, auth Mongo, negar startup/egress inseguro | Flags de resultado, image ID e logs no artefato container; sem endpoint público |
| Electron | Empacotamento Windows real, canal test | NSIS produzido com frontend, loopback de teste, sem publicação | result.json e instalador no artefato Electron; não executado/instalado em equipamento |

A auditoria independente dos snapshots não substitui as asserções transitórias executadas no teste. Os anexos registram o estado final de cada caso; por exemplo, o valor fiado intermediário 10 é verificado pelo teste e o snapshot final registra 0. Nenhum resultado autoriza atendimento real, impressão física ou exposição pública.
