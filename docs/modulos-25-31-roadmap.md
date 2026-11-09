# Apollo PDV 3.0 — Módulos 25 a 31

Autorização: incluir no planejamento e desenvolver na branch `fix/windows-production-server`, sem alterar produção.

## Prioridade inegociável: versão estável de testes Windows
Antes de considerar qualquer módulo novo pronto, validar login/permissões, mesas/comandas, cozinha, pagamentos/caixa, estoque, operação offline e instalador Windows. CI verde significa compilação/testes automatizados aprovados, não comprova teste físico de impressoras, periféricos nem operação offline real.

## Funcionalidades autorizadas
| Nº | Módulo | Critérios mínimos de aceitação |
|---|---|---|
| 25 | Totem de autoatendimento | Catálogo e adicionais; confirmação de preços no servidor; pedido sem duplicação; opção de pagamento compatível; operação isolada por estabelecimento. |
| 26 | App de entregadores e rotas | Atribuição de pedidos, estados da entrega, comprovante e acesso limitado aos pedidos atribuídos; privacidade e consentimento para localização. |
| 27 | PDV em maquininha SmartPOS | Integração por provedor homologado; reconciliação de transações, estornos e idempotência; fallback manual quando indisponível. |
| 28 | Balanças e venda por peso | Suporte configurável a padrões de etiquetas e equipamentos homologados; validação de peso, preço e código; testes com hardware real. |
| 29 | Cardápios especializados | Pizza meio a meio, tamanhos, adicionais, combos, rodízio, buffet e taxas configuráveis; cálculo de preço e estoque consistentes. |
| 30 | Suporte e atualização automática | Diagnóstico sem expor segredos, versões assinadas, backup e rollback, atualização com confirmação do operador e registro de auditoria. |
| 31 | Migração de outros PDVs | Importação CSV/XLSX com prévia, validação, mapeamento de campos, deduplicação, relatório de erros e reversão segura; nunca alterar dados originais sem confirmação. |

## Entrega
1. Manter módulos 25–31 no backlog enquanto a versão estável Windows é validada.
2. Auditar funcionalidades já existentes antes de implementar, evitando duplicação.
3. Implementar por etapas com testes automatizados e documentação.
4. Não ativar integrações externas, publicar em produção nem afirmar homologação sem evidência.

**Status:** planejamento aprovado; implementação dos módulos 25–31 ainda não concluída.
