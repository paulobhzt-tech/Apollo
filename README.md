# Apollo PDV 3.0.1 — candidata P64.2

[Veja a continuação em Caixa, Estoque, Pessoas, Contas, DRE e navegação](CONTINUACAO.md). Esta página documenta a candidata anterior.

Branch `feat/p64-funcionalidades-completas`, candidata `727b260003893a37935401f05d59de8089ee19c1`. A branch P64 partiu de `1fc4124` e avançou por ancestralidade até a P63 `5b6f00e`, incluindo os trabalhos de impressão térmica e o protótipo Print Lite. [Alterações P64.2](https://github.com/paulobhzt-tech/Apollo/compare/5b6f00e...727b260)

## Capturas com dados fictícios

| Fluxo | Antes | Depois |
|---|---|---|
| Pagamento no balcão, 1366×768 | [Antes](pagamento-antes.png) | [Depois](pagamento-depois.png) |
| Salão, 1366×768 | [Antes](mesas-antes.png) | [Depois](mesas-depois.png) |
| Pagamento, 800×600 com zoom de 175% | | [Depois](pagamento-800-175.png) |

As capturas são do Apollo antes e depois, no mesmo servidor de laboratório. As referências originais do Consumer não estavam nos anexos acessíveis desta etapa. O mapeamento textual foi recuperado do repositório. A interface mantém identidade própria. [Matriz de referências P63](https://github.com/paulobhzt-tech/Apollo/blob/727b260/docs/homologacao/P63-REFERENCIAS.md)

## Auditoria de implementação

[Estado por item do comando P64.2](MATRIZ.md).

| Área | Origem | Implementação e evidência | Pendência |
|---|---|---|---|
| Menu e preferências | P63, `5b6f00e` | Preferências de visualização globais, 26 níveis, menos, mais, ajuste por viewport, restauração, persistência no cliente, três densidades e redução de efeitos | Medição de RAM e CPU no ASUS S400CA e testes de escala nativa do Windows |
| Pagamento | P63, `39be1d9` → `b17e2b2` | Dois painéis em telas largas, seções alternáveis em telas estreitas, consumo paginado, rodapé fixo de totais e ações | Validação de todos os fluxos e resoluções físicas da Espeteria |
| Mesas e PDV | P63, `163bf17` → `b17e2b2` | Grade de cartões adaptável, valores unitários e totais no consumo do pagamento; permissões e regras existentes preservadas no código | Reformulação das demais janelas e atalhos do roteiro P64.2 |
| Pré-conta e comprovantes | P63, `6795a35` → `ad81b14` | CSS de papel térmico, wrapping, vias do cadastro, HTML único no fallback browser e feedback de falha | Testar Epson real, comprimento, acentos e corte |
| Impressão automática e agente | P63, `47f34fe` a `5b6f00e` | Terminais Electron e impressão por setor existentes; protótipo Print Lite incorporado pela ancestralidade | Agente autenticado integrado ao PWA, diagnóstico do cenário da loja e validação física ponta a ponta |
| Offline, pagamentos, estoque e segurança | P63, `5b6f00e` | Preservados pela incorporação da linhagem; conferir resultados de regressão vinculados abaixo | Matriz completa por funcionalidade, concorrência e equipamento |
| Gestão e módulos restantes | P63, `5b6f00e` | Herdados da candidata anterior | Reformulação, recuperação e homologação individual dos itens do comando |

As referências remotas `audit/nov14`, `audit/qty-contracts`, `audit/quality` e as branches indicadas com o prefixo `apollo-301` não foram encontradas com esses nomes no remoto consultado. A consolidação comprovada nesta etapa é da linhagem P63 até `5b6f00e`.

## Atualização e rollback de homologação

1. Baixe o artefato do commit candidato. Confira `source-commit.txt`, `build-integrity.json` e `SHA256SUMS.txt`. Aplique exclusivamente em rede isolada e com banco descartável. [Pacote Docker e Web/PWA](https://github.com/paulobhzt-tech/Apollo/actions/runs/45562170237/artifacts/14998177712)
2. Use o instalador do canal de teste em perfil Windows de homologação. Confira o SHA-256 nos logs e o servidor selecionado antes de autenticar. [Instalador Windows](https://github.com/paulobhzt-tech/Apollo/actions/runs/45562174075/artifacts/14998633099)
3. Antes de trocar a imagem de homologação, preserve a imagem anterior e gere um backup da base de teste. Para rollback, aponte o laboratório para a imagem anterior e, se necessário, restaure o backup em uma nova base. A P63 tem ensaio isolado concluído e imagem de rollback com hash. [Evidência P63](https://github.com/paulobhzt-tech/Apollo/actions/runs/45555175931)
4. No Windows autorizado da Espeteria, confirme fila, porta e papel da Epson por diagnóstico de leitura. Use produtos e pedidos fictícios. Envie de Garçom Mobile para cozinha e bar com a Central de Impressão aberta no Apollo Windows. Confira a fila, os tickets por setor, pré-conta e duas vias com corte. Interrompa a segunda via no laboratório e confira papel e spooler antes de qualquer reenvio. [Checklist Epson](https://github.com/paulobhzt-tech/Apollo/blob/audit/p63-final-evidencias/INSTALACAO-E-HOMOLOGACAO.md)

## Testes e liberação

- Chromium local com banco descartável passou no pagamento misto e nos testes de quantidade, cópia e transferência. Conferiu o rodapé sem rolagem horizontal do modal em 156 combinações de seis resoluções e 26 níveis. A área central ainda pode rolar verticalmente em alturas reduzidas.
- Cinco navegações locais por configuração mediram a mediana até o primeiro produto visível no PDV. Foram 180 ms na base, 174 ms na candidata e 188 ms com efeitos reduzidos. As amostras não demonstram ganho de desempenho do modo. Não medem CPU, RAM total do navegador ou o ASUS piloto. [Amostras](medicoes-chromium.jsonl)
- SHA-256 do ZIP de artefato Docker/Web no Actions: `bd21b1e071b31223b4d87d10c49570a1bb6dcdea1b9cd95cc54e84ced2417e64`. Os arquivos internos têm checksums próprios.

- Na primeira execução, o NSIS encerrou com `0xC0000005` no Windows Server 2025 antes de abrir o aplicativo. A repetição do mesmo SHA passou no Windows Server 2025 e no Windows Server 2022. A causa da falha inicial permanece aberta. SHA-256 do EXE aprovado: `1aafbfcad05d3ead6b4601448a4d9a7bbd3b8ec50fb2cba046627529194a7ebd`. [Logs Windows](https://github.com/paulobhzt-tech/Apollo/actions/runs/45562174075)
- Build Web verificado contra o SHA candidato e 67 testes Vitest locais. 26 testes Node de desktop passaram.
- [CI de segurança e build](https://github.com/paulobhzt-tech/Apollo/actions/runs/45562166301) · [Bateria de regressão](https://github.com/paulobhzt-tech/Apollo/actions/runs/45562166315) · [Playwright](https://github.com/paulobhzt-tech/Apollo/actions/runs/45562166792) passou em Chromium (5), Firefox (4) e WebKit (4).
- Candidata parcial para homologação. O piloto requer teste físico pelo Apollo, principalmente a impressão automática que falhou no relato da loja. A eliminação de rolagem excessiva e a padronização de todos os módulos ainda estão abertas.
