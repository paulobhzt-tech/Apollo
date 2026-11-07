# Atualizacoes automaticas do Apollo PDV para Windows

O aplicativo comercial consulta atualizacoes oficiais do GitHub Releases cerca de 30 segundos apos abrir e a cada 6 horas. Quando uma nova versao for encontrada, baixa em segundo plano e instala ao **fechar o aplicativo**, nunca reinicia uma venda em andamento.

## Condicoes para funcionar
1. Publicar uma versao de **producao**, com numero `version` do `desktop/package.json` maior que o instalado.
2. Gerar o instalador com canal `production` e HTTPS valido, apos homologacao.
3. Publicar uma **GitHub Release publica, nao draft nem prerelease**, com o `Apollo-PDV-Setup.exe` **e os metadados de atualizacao** (`latest.yml` e arquivos `.blockmap` quando gerados) produzidos pela mesma compilacao. Apenas anexar o EXE nao habilita o atualizador.
4. O repositorio/releases deve ser acessivel sem autenticacao aos computadores clientes. Se for privado, implementar um servidor de updates autenticado antes da distribuicao.
5. Assinar digitalmente o instalador para distribuicao comercial confiavel. Validar a atualizacao entre duas versoes assinadas em uma VM antes de liberar clientes.

## Protecoes
- Builds de teste (`PDV_BUILD_CHANNEL=test`), desenvolvimento e testes `PDV_SMOKE` nao atualizam.
- Nunca publicar releases com builds de teste: usam `localhost:18080` e nao servem aos clientes.
- A atualizacao do aplicativo nao substitui backups, migracoes de banco ou validacao de API.
- Uma nova versao deve ser testada em instalacao limpa **e** atualizacao de uma versao anterior.
- O codigo esta preparado, mas a atualizacao automatica **nao esta homologada** ate haver releases assinadas, metadados, e um teste real de ponta a ponta.
