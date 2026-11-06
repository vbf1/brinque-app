# Segurança e proteção de dados

## Princípios
- Supabase Auth autentica usuários; RLS e verificações server-side autorizam operações.
- Dados devem permanecer isolados por empresa.
- Aplicações web e mobile são clientes não confiáveis.
- Nunca incluir service_role/secret key, tokens privados, senhas ou keystores no cliente ou documentação.
- A chave publishable não é segredo; sua exposição exige RLS correta e validação de autorização.
- Usar HTTPS e menor privilégio.

## Pontos de revisão conhecidos
Na auditoria do projeto foram observados avisos que exigem análise individual:
- 6 funções SECURITY DEFINER acessíveis por authenticated.
- 95 alertas relacionados a múltiplas políticas permissivas.
- 32 chaves estrangeiras sem índice de cobertura.
- 27 índices reportados como não utilizados.
- Extensão pg_net no schema public.
- Proteção contra senhas vazadas desabilitada.

Esses números são um retrato da auditoria, não uma afirmação de vulnerabilidade explorável. Políticas permissivas podem ser intencionais (por exemplo, regras de proprietário de plataforma). Não corrigir em lote sem identificar objetos, chamadas, papéis e efeitos.

## Edge Functions
A auditoria identificou funções com verify_jwt habilitado e funções sem verificação no gateway. Quando verify_jwt está desabilitado, a própria função precisa validar token, assinatura, escopo e/ou token público conforme o desenho do endpoint. Revisar todos os caminhos de cada função.

## Segredos e arquivos
- Manter secrets no armazenamento protegido do GitHub Actions/Supabase.
- Arquivos de assinatura Android nunca devem entrar no Git.
- Arquivos públicos de configuração Firebase necessários ao build não são automaticamente segredos; confirmar seu conteúdo antes de alterar regras de ignore.
- Não compartilhar logs que contenham tokens ou dados pessoais.

## Processo de mudança de segurança
1. Identificar o objeto e o consumidor.
2. Documentar comportamento atual e esperado.
3. Revisar impacto em RLS, RPCs, triggers, funções e clientes.
4. Preparar teste positivo e negativo.
5. Definir rollback.
6. Obter aprovação antes de executar em produção.
