# API e contratos de integração

## Backend atual

O backend do KidsLoc é o projeto Supabase existente. Os clientes usam SDKs Supabase, APIs PostgREST/RPC, Auth e Storage. Edge Functions executam operações server-side específicas. O repositório não contém uma API REST própria dedicada.

## Autenticação e autorização
- Supabase Auth autentica usuários por e-mail e senha.
- O vínculo de usuário e empresa é consultado em `company_members`.
- A autorização de leitura/escrita é complementada por políticas RLS.
- A chave publishable pode ser usada no cliente; service_role/secret deve permanecer somente em ambiente confiável.
- A presença de uma sessão não substitui a checagem de empresa, função e permissão.

## RPCs conhecidas no código/documentação
- `create_rental_with_items`: criação transacional de locação com itens.
- `update_rental_with_items`: atualização transacional de locação e itens.
- `register_rental_payment`: registro de pagamento vinculado à locação.
- `create_quote_with_items`: criação de orçamento com itens.

As assinaturas completas, parâmetros, retornos e grants devem ser extraídos do schema SQL vigente antes de documentar um contrato detalhado. Esta página não presume tipos não verificados.

## Edge Functions identificadas
| Função | JWT no gateway | Observação |
|---|---:|---|
| `manage-employees` | Sim | Operações de gestão de funcionários |
| `send-employee-push` | Não | O código possui validações próprias de sessão/permissão em fluxos autenticados; revisar cada caminho público |
| `rental-contract-public` | Não | Fluxo público baseado em token |
| `team-chat-members` | Sim | Gestão de membros do chat da equipe |

As configurações acima são um retrato de auditoria e devem ser rechecadas no Supabase antes de uma mudança de segurança.

## Storage
O Supabase Storage é usado para imagens e arquivos do aplicativo. Buckets, políticas e convenções de caminho devem ser consultados no projeto antes de alterar uploads, permissões ou exclusões.

## Regras para mudanças de contrato
1. Localize todos os consumidores React, Flutter, Edge Function e SQL.
2. Confirme assinatura, tipos, permissões, RLS e comportamento transacional.
3. Avalie compatibilidade com versões instaladas.
4. Atualize testes e documentação.
5. Não altere endpoint, RPC, payload ou política sem aprovação explícita.
