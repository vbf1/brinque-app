# Arquitetura atual — KidsLoc App

## Visão geral

O KidsLoc é organizado em três partes: cliente web React, projeto Android Flutter e backend Supabase compartilhado. A arquitetura descrita aqui representa o código encontrado no repositório no commit de referência desta documentação; não é uma declaração de que todos os módulos estejam ativos no fluxo de produção.

## Componentes

### Web
- React 19, TypeScript 5.8 e Vite 6 em `apps/desktop_react`.
- `App.tsx` concentra composição principal, navegação, autenticação e seleção de empresa.
- Telas e módulos ficam majoritariamente em `src/data/`.
- `companyDataRepository.ts` centraliza parte das operações, mas algumas telas ainda acessam Supabase diretamente.
- Não há atualmente um pacote compartilhado de tipos entre web e mobile.

### Android
- Projeto Flutter/Dart em `apps/mobile_flutter`.
- O `AuthGate` atual direciona para `CompanyHomePage`, que carrega a URL pública React em WebView.
- Há módulos Flutter nativos para várias áreas do produto, mas eles ainda não constituem o fluxo principal do APK.
- A migração para Flutter nativo é gradual e condicionada à paridade funcional, autenticação, recuperação de senha, notificações e testes em dispositivo.

### Backend
- Projeto Supabase existente: PostgreSQL, Auth, RLS, Storage, APIs PostgREST/RPC e Edge Functions.
- Web e Flutter usam SDKs Supabase e compartilham o backend.
- Não existe um servidor dedicado separado no repositório. Não criar outro backend por padrão; avaliar necessidade real antes.

### Integrações
- Firebase Cloud Messaging para notificações push Android.
- GitHub Actions para validação, builds e publicação web.

## Fluxo de dados e limites de confiança
- Clientes web/mobile são ambientes não confiáveis.
- Autenticação identifica a sessão; RLS e validações server-side determinam o acesso aos dados.
- Operações transacionais de locação usam RPCs existentes quando aplicável, incluindo `create_rental_with_items` e `update_rental_with_items`.
- Não colocar service_role/secret key em aplicações cliente.
- Dados de uma empresa não podem ser acessados por usuários de outra empresa sem autorização explícita de plataforma.

## Estrutura atual resumida

```text
apps/desktop_react/
apps/mobile_flutter/
supabase/functions/
supabase/migrations/
tests/
docs/
.github/workflows/
```

## Direção arquitetural aprovada nesta documentação
1. Preservar React e o fluxo web publicado.
2. Preservar o projeto Flutter e concluir paridade antes de alterar o fluxo principal Android.
3. Manter Supabase como backend compartilhado.
4. Consolidar gradualmente contratos, validações e acesso a dados, sem duplicar regras ou introduzir dependências desnecessárias.
5. Não reconciliar migrações ou alterar banco como parte de uma simples documentação.
6. Toda mudança estrutural deve ter proposta, aprovação, testes e plano de reversão próprios.
