# Homologação de segurança e permissões — Apollo PDV 3.0

## Implementação inicial
- As rotas privadas da aplicação React verificam sessão via `/auth/me`.
- Cada rota protegida consulta a matriz `NAV.roles` existente.
- Sem sessão válida: redireciona para login.
- Perfil sem autorização: redireciona para a página inicial do perfil.
- Rotas públicas de cardápio e pedido permanecem públicas, sem regressão intencional.
- Esta camada não substitui validação de permissões nas APIs.

## Testes obrigatórios antes do merge
1. Sem login, abrir `/config`, `/funcionarios`, `/financeiro` e `/caixa`: deve pedir login.
2. Com garçom, acessar diretamente `/config`, `/funcionarios`, `/caixa`, `/produtos`: deve negar.
3. Com cozinha, acessar `/financeiro`, `/config`, `/vendas`: deve negar.
4. Com caixa, acessar `/funcionarios`, `/config`, `/financeiro`: deve negar; `/caixa` deve funcionar.
5. Com admin, verificar todas as rotas operacionais.
6. Chamar diretamente cada endpoint protegido com cookies de cada perfil: deve retornar HTTP 403 quando proibido, independentemente da interface.
7. Testar sessão expirada, logout, atualização da página, navegação offline e retorno da conexão.
8. Verificar IDOR (acesso a dados de outro estabelecimento), alteração de perfil, credenciais e operações financeiras.
9. Validar build TypeScript, testes automatizados e smoke test Windows 10/11.

## Restrições
Sem vendas reais, pagamentos reais, migrações de banco, publicação ou merge em produção.
O controle de backup Google Drive deve exigir administrador também no backend.
