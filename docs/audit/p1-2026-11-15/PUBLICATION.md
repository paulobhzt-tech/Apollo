# Publicação P1

PR em rascunho: https://github.com/paulobhzt-tech/Apollo/pull/17

Base remota verificada: PR #16, fix/p0-financial-stock-atomicity, 09d3da735a4cb836cd05c43a81a47fde424475ab. Branch de trabalho: audit/p1-global-integrity-recovery. Sem merge/deploy. Produção REPROVADA.

## Commits

Publicados por API GitHub, preservando os pais e comparando SHA de árvore de cada commit com a árvore local. Metadados de autoria/data produzem SHAs de commit diferentes; conteúdo idêntico comprovado por árvore.

| Commit local | Commit remoto |
|---|---|
| 1fab275 | [adedd6f](https://github.com/paulobhzt-tech/Apollo/commit/adedd6fbab2e63d9bde62b9b6a4aee45a0a33b61) |
| 216f0e5 | [13b1105](https://github.com/paulobhzt-tech/Apollo/commit/13b110548967e06b7acc0c0ff2c1584796fff9d3) |
| f59bddc | [3ab8468](https://github.com/paulobhzt-tech/Apollo/commit/3ab8468c6709e1e7ea1a528e4184ad96606e8bc7) |
| 229b87a | [423bda8](https://github.com/paulobhzt-tech/Apollo/commit/423bda84dab56f1e86060131a0f02b0bfbef219c) |
| a1c4bd9 | [bf0cf6a](https://github.com/paulobhzt-tech/Apollo/commit/bf0cf6aebfbe0716adcf831aff563d2eb6f7f52e) |
| 5d52946 | [0f14aad](https://github.com/paulobhzt-tech/Apollo/commit/0f14aad6c8cb04e5081c0be92bebaa40f028b33b) |
| 5ff6a83 | [80de255](https://github.com/paulobhzt-tech/Apollo/commit/80de25543fe3a7c60762c92b15d206ff60494d0e) |
| 36b0479 | [7c57b53](https://github.com/paulobhzt-tech/Apollo/commit/7c57b53684ab488a7defa6165efc9c2ab4b0833a) |
| 266bc23 | [b07f516](https://github.com/paulobhzt-tech/Apollo/commit/b07f516e680a03ce0c69589a704906db5bd271e0) |
| 6024f04 | [6816412](https://github.com/paulobhzt-tech/Apollo/commit/68164125a56d534ceb70128ed46e9d6297b7505f) |

O commit documental que contém este arquivo acrescenta relatórios e evidências; seu SHA é o HEAD consultável no PR. Lista de mensagens e arquivos: FILES.md. O commit de benchmark está na cadeia final, após o HEAD inicial b07f516.

## CI observado

HEAD inicial publicado b07f516e680a03ce0c69589a704906db5bd271e0: workflows 43749053633 (Bateria), 43749053680 (Validação) e 43749144701 (PR/Bateria) concluíram com success. Job transacional 132918703066: 65 passed em 40,95 s. Job multinó 132918703072: autenticação negou acesso anônimo, duas tentativas, um movimento, eleição em 10,112 s e reinício preservou dado. Frontend via Yarn e sintaxe desktop Linux aprovados; isso não homologa Windows.

- https://github.com/paulobhzt-tech/Apollo/actions/runs/43749053633
- https://github.com/paulobhzt-tech/Apollo/actions/runs/43749053680
- https://github.com/paulobhzt-tech/Apollo/actions/runs/43749144701

Os workflows também são disparados para o HEAD final. O estado final é conferido no PR após a atualização; não se presume sucesso de job ainda em execução. A descrição do PR registra a última verificação sem criar um ciclo infinito de commits apenas para registrar seu próprio SHA.

## Evidência local e matriz

344 testes backend + 3 subtestes, 25 P1/conciliação contidos no total, seis Node, typecheck/build/lint e failover real aprovados. Soak real de 1811,074 s: assert de integridade aprovado, disponibilidade/capacidade de 50/100 sessões reprovada devido a 503. Sem ganho de desempenho antes/depois alegado.

A matriz descreve 200 atividades com escopo e limites. APROVADO não certifica a área inteira ou produção. Pendências essenciais: legado, recuperação operacional externa, Windows/múltiplas janelas, carga e dependências residuais.

