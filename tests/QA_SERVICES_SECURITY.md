# KidsLoc QA — auditoria de serviços e segurança

Data da leitura: 2026-11-03. Consulta somente leitura; nenhuma configuração foi alterada.

## Edge Functions: versão implantada x repositório
- `manage-employees`: versão implantada 8; `verify_jwt=true`; arquivo implantado idêntico ao `supabase/functions/manage-employees/index.ts` da branch QA (9.253 bytes).
- `send-employee-push`: versão implantada 10; `verify_jwt=false`; arquivo implantado idêntico ao `supabase/functions/send-employee-push/index.ts` da branch QA (18.483 bytes).
- Na função de push, o código valida o token recebido com `auth.getUser(token)` e verifica se o usuário é owner/admin da empresa antes de enviar. Como a validação JWT da plataforma está desativada para essa função, essa validação manual é um ponto crítico para testes negativos; não alterar sem cobrir chamadas inválidas.

## Buckets de Storage encontrados
| Bucket | Público | Limite |
|---|---:|---:|
| company-branding | Sim | 5 MiB |
| occurrence-photos | Não | 8 MiB |
| product-images | Não | 8 MiB |

As políticas de Storage e o isolamento por empresa ainda precisam de testes de integração com usuários fictícios e arquivos de teste.

## Alertas do Supabase Security Advisor
- 1 extensão no schema public: `pg_net`.
- 6 funções SECURITY DEFINER executáveis por authenticated: `add_company_member`, `can_manage_rental`, `create_company`, `ensure_team_group`, `has_company_role`, `is_company_member`. Algumas são helpers de autorização usados pelas políticas RLS; não revogar permissões indiscriminadamente. Revisar cada assinatura, corpo e finalidade.
- Proteção contra senhas vazadas desativada no Auth. Requer decisão de configuração e teste de login; nenhuma mudança foi feita.

## Alertas do Performance Advisor
- 28 chaves estrangeiras sem índice de cobertura.
- Duas políticas de `profiles` reavaliam `auth.uid()` por linha.
- Políticas permissivas múltiplas em `profiles` para SELECT.
- 13 índices classificados como não utilizados; são sinais informativos, não autorização para removê-los.

## Critérios antes de qualquer correção
1. Reproduzir em banco local e com usuários/dados sintéticos.
2. Confirmar os papéis e fluxos legítimos owner/admin/staff.
3. Comparar planos e comportamento antes/depois.
4. Executar advisors e testes de RLS/Storage após a alteração.
5. Não executar DDL nem mudar Auth/Storage no projeto remoto durante esta auditoria.
