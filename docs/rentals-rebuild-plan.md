# Reconstrução do módulo de locações — KidsLoc App

## Escopo
Reconstruir o fluxo de locações para Web (React/Vite) e Android (Flutter), mantendo os módulos independentes de clientes, produtos/estoque, funcionários, autenticação e financeiro.

## Componentes antigos identificados
- Web: `apps/desktop_react/src/data/RentalsPage.tsx`, `CustomerPicker.tsx` e métodos em `companyDataRepository.ts`.
- Android: `apps/mobile_flutter/lib/features/rentals/rentals_page.dart` e `rental_time.dart`.
- Banco: tabelas `rentals`, `rental_items`, `rental_responsibles`, `rental_events`, `rental_item_units`, `rental_contracts`, `rental_event_reminder_settings`, `rental_event_reminder_deliveries`.
- Rotinas SQL: `can_manage_rental`, `create_rental_with_items` (3 assinaturas), `update_rental_with_items` (2 assinaturas), `register_rental_payment`, `save_rental_responsibles`.
- Integrações: contratos, lembretes, documentos, pagamentos, financeiro, cotações e estoque.

## Fotografia do banco (somente leitura; 2026-11-07)
| Tabela/relacionamento | Registros |
|---|---:|
| rentals | 1 |
| rental_items | 1 |
| rental_responsibles | 2 |
| rental_events | 1 |
| rental_contracts | 7 |
| rental_item_units | 0 |
| rental_event_reminder_settings | 0 |
| rental_event_reminder_deliveries | 0 |
| documents com rental_id | 0 |
| financial_transactions com rental_id | 0 |
| payments com rental_id | 0 |
| quotes com converted_rental_id | 0 |

## Dependências e proteção de dados
- `rentals` referencia clientes e empresa; não remover clientes, produtos, funcionários ou empresas.
- Tabelas auxiliares de locação têm FKs para `rentals`; devem ser limpas na ordem correta ou por cascata validada.
- Contratos estão vinculados por `rental_contracts.rental_id`; os 7 registros existentes são dados do módulo e só devem ser removidos na etapa de limpeza autorizada da transição.
- FKs de documentos, financeiro, pagamentos e cotações apontam para locações, mas a auditoria encontrou zero registros vinculados nesses quatro campos.
- Não executar DROP/DELETE/DDL no banco até a nova implementação e a estratégia de migração terem sido revisadas e testadas.

## Estratégia de reconstrução
1. Desenhar um único contrato de dados/validação para locação e itens.
2. Criar operações transacionais no banco para criar/editar/cancelar locação e atualizar disponibilidade de estoque de forma atômica.
3. Reconstruir a experiência Web com seleção de cliente pesquisável e carregamento observável, seleção de vários brinquedos, cálculo, datas/horários, entrega e responsáveis.
4. Reconstruir a experiência Android consumindo as mesmas regras e operações do banco.
5. Integrar contratos e lembretes somente após o núcleo de locações estar validado.
6. Testar permissões/RLS, concorrência de estoque, duplicidade de itens, datas/horários, falhas de rede e rollback.
7. Preparar migration destrutiva separada para remover dados/rotinas antigas somente na transição final, após backup e validação.

## Restrições
- Sem alterações na branch principal, deploy, publicação de APK ou mudanças destrutivas no Supabase nesta fase.
- Preservar o applicationId Android, assinatura e configurações de publicação.
- Nenhum serviço pago ou assinatura.
