# Matriz P6

**Produção reprovada.** Backend refere-se a testes reais de transações; 44 cenários browser aprovados no CI 43901788525, em quatro resoluções Chromium. Aprovação é limitada aos cenários descritos.

| Área | Evidência atual | Limite |
|---|---|---|
| Login/sessões | Backend real, TLS local, P5 UI | Matriz P6 de expiração/logout/abas aprovada no cenário |
| Caixa abrir/fechar | Backend real, corrida com pagamento/cancelamento/estorno | Fluxo Aprovado no cenário UI |
| Venda e dinheiro | Rollback/estoque/caixa reais | Aprovado no cenário UI; não liquidação bancária |
| Fiado | Crédito, saldo e movimentos reais | Aprovado no cenário UI |
| Desconto | Validação backend; fluxo admin aprovado no cenário | Não cria novo privilégio ou regra de desconto |
| Estoque/lotes | FEFO/última unidade/devolução em integração; estoque no soak | CRUD e inventário completo UI pendentes |
| Duplo clique/replay | 2/10/50 replays backend; Web Locks unitário | Aprovado no cenário UI |
| Perda de resposta/reload/aba | Marcador read-only real, referência durável unitária | Aprovado no cenário UI; ausência bloqueia para assistência |
| Commit desconhecido/falhas | Failpoints Mongo reais, rollback e processo morto | Aprovado no cenário UI; não falha física de energia |
| Autorização/CSRF | RBAC/CSRF em UI real; regressão backend e TLS | Não substitui revisão completa de XSS/CSP/tenant |
| Mesas/comandas/QR/delivery | Regressões backend herdadas | Não homologados integralmente na web P6 |
| Produtos/categorias/clientes | Cadastros/telas herdados, fixture real | Não homologados integralmente na web P6 |
| Cancelamentos/estornos | Backend real e soak | Fluxos UI completos pendentes |
| Dashboard/relatórios/config | P5 rotas/perfis | Não homologados integralmente na web P6 |
| Impressão | Falha engolida reproduzida/corrigida, confirmação manual | Sem teste físico; cancelamento da confirmação do operador aprovado |
| Offline | Bloqueado no browser, 7 regressões herdadas | Não homologado, não habilitado |
| Responsividade | P5 12 aprovados; P6 quatro resoluções aprovadas no cenário | Emulação Chromium, nenhum aparelho físico |
| Capacidade | Pareado 300 s por versão, 503 em ambas, integridade aprovada | Reprovada; nenhuma melhoria comprovada |
| Electron | Arquivos desktop intactos; build legado aprovado | Não substitui homologação Windows/dispositivos |
