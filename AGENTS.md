# Instruções de trabalho — KidsLoc App

Estas regras se aplicam a todo o repositório e prevalecem sobre conveniências locais de implementação.

## Antes de alterar
1. Entenda o pedido, o comportamento atual e os critérios de aceite.
2. Inspecione o código, os dados, os fluxos e as implementações existentes antes de criar ou substituir algo.
3. Identifique arquivos, dependências, APIs, tabelas, políticas, funções, integrações e plataformas afetadas.
4. Apresente plano com escopo, itens fora do escopo, arquivos previstos, riscos, compatibilidade, validações e rollback.
5. Aguarde aprovação explícita para mudanças estruturais, destrutivas, de segurança, autenticação, banco, dependências, integrações, publicação ou produção.
6. Se faltar informação que altere a solução, pergunte antes de assumir.

## Regras de implementação
- Faça mudanças pequenas, incrementais e compatíveis com o estado atual.
- Preserve código, telas, fluxos, dados, configurações e recursos que já funcionam.
- Procure implementações equivalentes antes de criar novos arquivos, serviços, tabelas ou componentes.
- Não reescreva arquivos inteiros quando uma alteração localizada resolver.
- Não altere arquivos fora do escopo aprovado.
- Não adicione, remova ou atualize dependências sem apresentar motivo, versão, impacto e obter aprovação.
- Não altere secrets, variáveis de ambiente, credenciais ou configurações de produção.
- Não apague arquivos, tabelas, colunas, registros, políticas, buckets ou funções sem aprovação específica.
- Não execute migrações nem operações destrutivas no banco sem aprovação explícita e plano de recuperação.
- Não invente funcionalidades, resultados de testes ou estado de implementação.
- Atualize testes e documentação relacionados à mudança.

## Regras específicas do KidsLoc
- Produto: KidsLoc App, da Sonho Kids Brinquedos. Não confundir com marcas ou projetos anteriores.
- Backend atual: Supabase. Reutilize o projeto e os contratos existentes; não introduza outro backend sem justificativa e aprovação.
- Web atual: React + TypeScript + Vite.
- Android atual: projeto Flutter, cujo fluxo principal ainda carrega a aplicação React publicada em WebView. Não conecte o shell Flutter nativo ao fluxo principal até que a paridade e os fluxos críticos sejam validados e a troca seja aprovada.
- Preserve o identificador Android `br.com.sonhokids.kidsloc`, a chave de assinatura existente e a capacidade de atualizar instalações sem perder dados.
- Para futuras versões Android, preserve o processo de atualização via GitHub Releases e incremente versionCode/versionName conforme a estratégia de release aprovada. Nunca gere uma chave de assinatura substituta.
- Preserve isolamento por empresa, autenticação, permissões e RLS.
- Não trate alertas de segurança do Supabase como autorização para alterações em lote; avalie cada política/função individualmente.
- Não suponha que o histórico de migrações do banco corresponde aos arquivos SQL versionados. Reconcilie antes de qualquer migração.
- O usuário prioriza ferramentas e serviços gratuitos. Não contrate planos, crie assinaturas, habilite cobranças ou use serviços pagos sem autorização expressa.

## Segurança
- Nunca exponha chaves service_role/secret, tokens, senhas, keystores ou dados pessoais em código, logs, documentação ou commits.
- Chaves publishable podem estar em clientes quando o desenho do Supabase assim exigir; RLS e autorização no servidor continuam obrigatórias.
- Valide permissões no backend, aplique menor privilégio e valide entradas em limites confiáveis.
- Mudanças em autenticação, sessão, RLS, SECURITY DEFINER, RPCs, Storage ou Edge Functions exigem revisão de impacto e testes específicos.

## Git e publicação
- Trabalhe em branch isolada para cada etapa aprovada.
- Nunca faça push, merge, rebase remoto, deploy, publicação ou release sem autorização explícita.
- Antes de qualquer push remoto, apresente o diff completo e aguarde autorização.
- Não force push nem sobrescreva trabalho de terceiros.
- Prefira commits pequenos e descritivos. Antes de commitar, execute as validações aplicáveis e revise o diff.
- Não misture documentação, correções funcionais e refatorações em uma única etapa sem aprovação.

## Validação obrigatória
Execute o que for aplicável ao escopo:
- React: build TypeScript/Vite; testes existentes; lint/typecheck/test separados somente se os scripts estiverem configurados.
- Flutter: `flutter analyze`, `flutter test` e build Android quando aplicável.
- Backend/banco: testes de contratos, autorização, RLS e migrações em ambiente seguro; nunca usar produção para experimentos destrutivos.
- Web e Android: validar os fluxos afetados e regressões relevantes.
- Revisar diff, arquivos inesperados, secrets acidentais e compatibilidade.
- Diferencie claramente testes executados nesta alteração, resultados de CI anteriores e verificações não realizadas.

## Documentação
Mantenha coerentes README, arquitetura, produto, API, decisões, changelog, testes, segurança e inventário de migrações. Registre decisões e pendências sem apresentar planos como funcionalidades já entregues.

## Entrega
Toda implementação deve terminar com:
1. Resumo do que mudou.
2. Arquivos criados/alterados.
3. Testes executados e resultados reais.
4. O que não foi testado e por quê.
5. Riscos, pendências e rollback.
6. Estado de branch, commit, push, merge e deploy, sem confundir essas etapas.
