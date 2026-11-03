# KidsLoc QA — achado crítico de RLS: isolamento de locações

Data: 2026-11-03
Ambiente consultado: Supabase remoto, somente leitura.
Status: confirmado na definição das políticas; nenhuma alteração aplicada.

## Resumo
As políticas PostgreSQL RLS são permissivas por padrão e políticas permissivas para o mesmo papel/operação são combinadas com OR. Foram encontradas políticas amplas `company_members_all` que permitem acesso a qualquer membro da empresa, coexistindo com políticas de escopo por locação. Isso pode tornar ineficaz o isolamento pretendido para funcionários.

## Políticas confirmadas

| Tabela | Política ampla | Escopo adicional | Risco |
|---|---|---|---|
| rentals | company_members_all — ALL, `is_company_member(company_id)` | rentals_scope_select, rentals_update_scope, rentals_delete_scope | SELECT e outras operações podem ser liberadas pela política ampla |
| rental_items | company_members_all — ALL, membro da empresa | rental_items_mutation_scope e rental_items_scope_select | Acesso a itens de locações não atribuídas |
| rental_events | company_members_all — ALL, membro da empresa | rental_events_mutation_scope e rental_events_scope_select | Acesso a eventos de locações não atribuídas |
| rental_item_units | company_members_all — ALL, membro da empresa | rental_item_units_mutation_scope e rental_item_units_scope_select | Acesso a unidades ligadas a locações não atribuídas |
| rental_responsibles | rental_responsibles_select_company — SELECT, membro da empresa | rental_responsibles_scope_select | Leitura de responsáveis além do escopo pretendido |

A consulta também confirmou que as políticas de escopo de leitura para rentals verificam owner/admin ou usuário atribuído em `rental_responsibles`, mas a política permissiva ampla permanece ativa.

## Impacto potencial
Um usuário com papel staff que seja membro da empresa pode conseguir acessar diretamente pela API REST dados de locações não atribuídas, e potencialmente alterar dados em tabelas que ainda tenham a política ampla ALL. O comportamento exato por operação precisa ser validado com duas contas sintéticas em um ambiente local fiel ao esquema.

A interface esconder ou filtrar essas locações não é controle de segurança suficiente; a restrição precisa ser aplicada no banco.

## Próximas correções propostas — NÃO EXECUTADAS
1. Reconstruir o esquema e histórico de migrações em banco local isolado.
2. Preparar uma migração corretiva que remova/substitua apenas as políticas amplas nas tabelas afetadas, preservando acesso de owner/admin e acesso de staff às locações atribuídas.
3. Rever também as políticas de `rental_responsibles` e garantir que funcionários só vejam o que o produto realmente exige.
4. Testar com owner, admin, manager e dois funcionários; cobrir SELECT, INSERT, UPDATE e DELETE, inclusive tentativas cross-company.
5. Confirmar que a criação de locações, atribuição de responsáveis, inventário e eventos continuam funcionando.
6. Só então solicitar aprovação para aplicar a migração no projeto principal.

## Observação
Não foi executado DROP POLICY, ALTER POLICY, UPDATE, INSERT ou DELETE no Supabase remoto. O relatório é diagnóstico, não uma alteração aplicada.
