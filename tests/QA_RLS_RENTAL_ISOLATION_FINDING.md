# KidsLoc QA — revisão de RLS: isolamento de locações

Data: 2026-11-03
Ambiente consultado: Supabase remoto, somente leitura.
Status: revisão complementar das políticas; nenhuma alteração aplicada.

## Conclusão corrigida
A presença das políticas permissivas antigas `company_members_all` inicialmente pareceu permitir que qualquer membro da empresa ultrapassasse as regras de escopo. A consulta complementar da coluna `pg_policies.permissive` e a leitura da migração `20261103120000_restrict_rental_visibility_to_assigned_staff.sql` demonstraram que as políticas de escopo relevantes foram criadas como **AS RESTRICTIVE**.

No PostgreSQL, políticas RESTRICTIVE são combinadas com AND em relação às políticas permissivas. Portanto, as políticas restritivas confirmadas continuam limitando o acesso apesar da política permissiva ampla. A suspeita inicial de bypass por OR não se confirma para as operações e tabelas listadas abaixo.

## Políticas restritivas confirmadas no banco

| Tabela | Política restritiva | Operações |
|---|---|---|
| rentals | rentals_scope_select | SELECT |
| rentals | rentals_update_scope | UPDATE |
| rentals | rentals_delete_scope | DELETE |
| rental_items | rental_items_scope_select | SELECT |
| rental_items | rental_items_mutation_scope | ALL |
| rental_events | rental_events_scope_select | SELECT |
| rental_events | rental_events_mutation_scope | ALL |
| rental_item_units | rental_item_units_scope_select | SELECT |
| rental_item_units | rental_item_units_mutation_scope | ALL |
| rental_responsibles | rental_responsibles_scope_select | SELECT |
| rental_responsibles | rental_responsibles_insert_scope | INSERT |
| rental_responsibles | rental_responsibles_delete_scope | DELETE |

As regras de escopo consultam `can_manage_rental` ou a visibilidade da locação pai. A função `can_manage_rental` permite owner/admin, funcionário explicitamente atribuído e, quando não há responsáveis atribuídos, o criador da locação.

## O que ainda precisa de validação
- Testes reais de RLS com duas contas staff, contas owner/admin e duas empresas sintéticas.
- Confirmar SELECT/INSERT/UPDATE/DELETE em locações, itens, unidades, eventos e responsáveis.
- Verificar se subconsultas e operações em lote respeitam o mesmo escopo.
- Verificar o comportamento quando uma locação muda de responsável e quando fica sem responsáveis.
- Confirmar que os fluxos de inventário e criação de locação continuam funcionando.

## Segurança operacional
Nenhuma política foi removida ou alterada. Nenhum dado remoto foi modificado. A validação definitiva exige um banco local fiel ao esquema e testes com usuários sintéticos; os testes Playwright atuais usam Supabase simulado e não comprovam RLS real.
