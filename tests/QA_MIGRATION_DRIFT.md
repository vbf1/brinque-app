# KidsLoc QA — inventário de migrações

Snapshot comparativo feito em 2026-11-03. Este documento é apenas diagnóstico; nenhuma migração foi aplicada, removida ou reordenada.

## Histórico informado pelo Supabase (13)
- 20261103044629 — create_transactional_rental_inventory
- 20261103044914 — index_inventory_rental_lookup_paths
- 20261103054811 — web_push_employee_notifications
- 20261103054835 — secure_push_key_initialization
- 20261103054949 — restrict_push_trigger_function_execution
- 20261103063013 — harden_public_function_execute_privileges
- 20261103063031 — restrict_trigger_function_execution
- 20261103070223 — product_images_storage_gallery
- 20261103070341 — scope_product_image_policies
- 20261103072740 — create_occurrence_reports_and_photos
- 20261103142119 — add_fcm_device_tokens
- 20261103163157 — company_branding_assets
- 20261103163514 — team_messaging

## Arquivos encontrados em supabase/migrations (5)
- 20261103072740 — create_occurrence_reports_and_photos
- 20261103090000 — rental_responsibles_and_delivery_address
- 20261103120000 — restrict_rental_visibility_to_assigned_staff
- 20261103142119 — add_fcm_device_tokens
- 20261103143000 — fix_product_image_storage_policies

## Divergência
Em comum: 20261103072740 e 20261103142119.

Registradas no Supabase, mas sem arquivo correspondente no repositório:
- 20261103044629 — create_transactional_rental_inventory
- 20261103044914 — index_inventory_rental_lookup_paths
- 20261103054811 — web_push_employee_notifications
- 20261103054835 — secure_push_key_initialization
- 20261103054949 — restrict_push_trigger_function_execution
- 20261103063013 — harden_public_function_execute_privileges
- 20261103063031 — restrict_trigger_function_execution
- 20261103070223 — product_images_storage_gallery
- 20261103070341 — scope_product_image_policies
- 20261103163157 — company_branding_assets
- 20261103163514 — team_messaging

Arquivos no repositório sem registro correspondente no histórico retornado:
- 20261103090000 — rental_responsibles_and_delivery_address
- 20261103120000 — restrict_rental_visibility_to_assigned_staff
- 20261103143000 — fix_product_image_storage_policies

## Próxima ação segura
Antes de reconstruir um banco local, recuperar/derivar o SQL exato das migrações ausentes e validar dependências, triggers, funções, políticas RLS e Storage. Não executar esses arquivos no projeto remoto e não marcar migrações como aplicadas para contornar a divergência. Nenhum dado de negócio foi consultado para produzir este inventário.
