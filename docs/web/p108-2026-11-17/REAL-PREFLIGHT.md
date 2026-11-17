# P10.8 — preflight real recebido e investigação de perfil

17/11/2026. Código do preflight: commit `cfdb8e5d6c4c4ec9020763b3d08c584ef9aac21a`. Relato recebido do proprietário nesta sessão: execução via PowerShell/SSH autenticado, COMPLETE em 5,79 s, mutations_executed=false. Este documento incorpora o **resumo de execução fornecido pelo proprietário**, não uma sessão SSH executada pelo Work nem uma transcrição JSON original anexada. Não há novo acesso remoto ou mudança operacional nesta retomada.

**Veredito: preflight de leitura concluído conforme relato; HOMOLOGAÇÃO BLOQUEADA.** rs0 não iniciado, containers não reiniciados, manutenção não aberta.

## Inventário incorporado

| Item | Resultado recebido |
|---|---|
| Produção | Apollo/Mongo running, mesmos estados before/after, volumes separados da homologação |
| Homologação | Apollo/Mongo running, MongoDB 7.0.45, auth administrativa e replSetConfigure confirmadas, standalone |
| Banco | apollo_homologacao; 29 coleções, 37 documentos, 69 índices |
| Dados lógicos | 8.688 bytes |
| Diretório /data/db | 357.196 KiB = 348,82 MiB |
| Journal | 307.204 KiB = aproximadamente 300 MiB, 86,00% do diretório |
| Backup | 7.243 bytes; GZIP válido; SHA-256 igual ao esperado; 27.327 bytes descomprimidos |
| SHA-256 de referência do backup | ebbb6988098a5d910bfe65503ba84fd5d7e18ea2b7df7c1da13a844246c4c2cb |
| Restauração desse backup | Não comprovada |
| RAM/swap/disco | ~741 MiB disponíveis, ~1,4 GiB swap usada, ~23 GB livres |
| Perfil visível no preflight | APOLLO_ENV ausente; APP_URL host=teste.apollo-pdv.com |
| Domínio público esperado | homologacao.apollo-pdv.com |
| Escritores/readiness/rollback | Não totalmente inventariados / não comprovado / não ensaiado |

Os números de banco representam a captura atual; 69 índices é um total, não prova dos nomes, chaves, unique, filtros parciais ou TTL necessários. O código usa dbStats para estatísticas de banco e countDocuments no inventário por coleção: sem a saída detalhada original, não afirmar que os 37 documentos foram independentemente somados pelo Work. Se o sumário não contiver comparação `mongo_port_published`, redes, montagens, nomes de volumes, índices e usuários, esses detalhes continuam dependentes do original protegido ou de leitura complementar.

## Parecer sobre o tamanho

O journal domina o armazenamento físico observado. A diferença entre 8.688 bytes de dados lógicos e 348,82 MiB de diretório físico deixou de ser um mistério de ordem de grandeza: journal, estruturas do mecanismo, outros bancos, índices e espaço reutilizável não são exportados como uma cópia física pelo dump lógico comprimido. Os 50 MiB restantes tampouco devem ser classificados sem as estatísticas completas.

**Integridade de arquivo APROVADA no relato; backup recuperável ainda NÃO APROVADO.** GZIP/SHA e 27.327 bytes descomprimidos não identificam todos os namespaces/documentos/usuários do archive nem provam restauração. O inventário atual tem 37 documentos, enquanto referência histórica anterior era 36; isso pode refletir alteração entre pontos, expiração TTL ou diferenças de contagem. Não afirmar perda/corrupção nem definir 37 como contagem obrigatória do archive antigo sem manifesto correspondente.

## APP_URL e perfil — conclusão do código, runtime ainda a confrontar

Revisados `backend/server.py`, `backend/lib/db.py`, `backend/lib/csrf.py`, `backend/lib/homologation.py`, `backend/routers/drive.py` e `backend/routers/auth.py` no commit indicado.

- O servidor e lib.db chamam `load_dotenv` antes de validar o perfil. O preflight lê o ambiente de um **novo processo docker exec**, sem carregar o .env interno do backend. Portanto APOLLO_ENV ausente nesse processo não prova sozinho que a aplicação em execução deixou de carregar o perfil de algum arquivo/entrypoint. Conferir image ID/digest/código e fontes de configuração antes de concluir o modo efetivo.
- **Se** APOLLO_ENV também estiver ausente após resolução real de configuração, `homologation.enabled` é falso e `validate` retorna None. Nesse caso os gates específicos P10 de Host, egress e bloqueio de integrações não são ativados por esse módulo. As verificações gerais de autenticação/CSRF continuam existindo; ausência do perfil não é sinônimo de ausência de autenticação.
- O perfil P10, quando ativado, exige configuração coerente: p10/p10-mongo, banco sintético dedicado, origem permitida, papel restrito e integrações desabilitadas. Não basta adicionar APOLLO_ENV=homologation ao cenário atual rs0/mongo/apollo_homologacao/domínio novo: ele será recusado. Não mudar esse valor ou desabilitar proteções no ambiente vivo nesta investigação.
- Em CSRF, APP_URL participa da seleção de esquema quando seu netloc coincide com Host; a decisão de origem compara o Origin com o **Host da requisição**, não libera automaticamente o subdomínio teste. Quando não coincide, o caminho alternativo depende do esquema efetivo observado atrás do proxy. Os seis testes CSRF existentes passaram localmente; isso não valida forwarded headers do Virtualmin real.
- No conector Drive, `_base_url` prioriza x-forwarded-host/Host não locais; APP_URL é fallback. Assim, não está comprovado que callbacks atuais usem teste.apollo-pdv.com nem que a divergência obrigue redirecionamento. Requer revisão dos headers confiáveis e da origem efetiva, sem acionar `/api/drive/connect` (essa rota escreve estado OAuth).
- Cookie é configurado no código como Secure por padrão, HttpOnly, SameSite=lax, path=/ e sem Domain explícito. Conferir valores efetivos e cabeçalhos sanitizados; não supor cookie compartilhado entre subdomínios por causa de APP_URL.

**Decisão:** divergência de APP_URL confirmada no relato, origem da configuração e efeito operacional pendentes. Não há justificativa para editar .env ou reiniciar containers antes do diagnóstico. A próxima inspeção precisa responder se há valor desatualizado no Compose, env_file/.env, override, env de criação do container ou arquivos empacotados na imagem, e qual processo/código serve API versus SPA.

## Leitura complementar preparada — sem alterar serviços

No diretório real da homologação, por SSH já autenticado do proprietário, revisar localmente:

1. Labels Compose do container: projeto, service, working_dir/config_files e image ID/digest. Guardar paths completos/labels em evidência protegida; publicar apenas resumo necessário. Não presumir que o checkout atual corresponde à imagem de quatro dias.
2. Resolver o Compose **em memória**, sem imprimir JSON completo. Comparar somente APP_URL, APOLLO_ENV, DB_NAME, flags de cookie/demo/integrações, host/replicaSet/authSource sanitizados, portas e destinos de mounts. Não usar `docker compose config` sem filtro na saída compartilhada.
3. Confrontar origens desses campos nos arquivos efetivamente usados e o ambiente do container. Para .env, usar parser compatível com a origem (Compose/Python dotenv), nunca source/eval ou parser ingênuo que altere senhas. Não publicar chaves/valores de outras variáveis.
4. Conferir existência/permissões e chaves permitidas dos .env internos conhecidos pela imagem, sem imprimir conteúdo. Não importar server.py como “teste”: startup/import pode instalar guards, abrir conexões e causar efeitos. Resolver a precedência de configuração a partir de metadados/código e campos permitidos.
5. Verificar apenas GETs de `/api/`, `/api/demo-status` e `/api/health/ready`, pelo loopback e HTTPS, registrando código, Content-Type e campos booleanos permitidos; não bodies HTML/JSON brutos nem cookies. Resultado JSON ready:true continua obrigatório. A amostra pública anterior de readiness era HTML 200, não uma comprovação transacional.
6. Revisar vhost/proxy restrito à homologação, sem reload: upstream correto, Host/Origin/forwarded headers, e separação dos domínios teste/homologacao. Não acionar callbacks/webhooks/login nem fazer POST para diagnosticar configuração nesta fase.

Nenhum comando complementar foi executado remotamente pelo Work; nenhum valor foi corrigido no servidor. Origem da divergência não foi inventada. Ver [plano de ensaio isolado e janela](RESTORE-ROLLBACK-PLAN.md).

## Atualização de prontidão

| Requisito | Estado |
|---|---|
| Preflight real e preservação before/after de produção | CONCLUÍDO conforme resumo do proprietário |
| Integridade do arquivo GZIP/SHA | APROVADA conforme resumo |
| Capacidade em pico/reserva do outro site | NÃO COMPROVADA; amostra de 741 MiB não é orçamento |
| APP_URL/perfil efetivo | Divergência identificada; investigação documental concluída; runtime pendente |
| Arquivo atualizado restaurável / identidades / comparação de índices e conteúdo | PENDENTE |
| Escritores/consistência do ponto | PENDENTE |
| Rollback validado | PENDENTE |
| rs0/manutenção/restarts | NÃO EXECUTADOS; janela não autorizada nesta retomada |
| Homologação/produção | BLOQUEADAS |

O original REPORT.md descreve a etapa anterior; não apagar os fatos históricos de falta de acesso do Work. A execução do proprietário resolve a pendência de preflight, não transforma restore/rollback em testes aprovados.
