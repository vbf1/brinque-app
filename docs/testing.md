# Estratégia de testes e validação

## Objetivo
Validar alterações no escopo real e reduzir regressões entre web, Android, Supabase e publicação. Um build bem-sucedido não substitui testes funcionais nem validação em aparelho.

## Comandos conhecidos

### React
```sh
cd apps/desktop_react
npm ci
npm run build
```
O script `build` executa `tsc -b && vite build`. O `package.json` atual não define scripts separados de lint, typecheck ou test.

### Testes web existentes
Na raiz:
```sh
node tests/ui-visual-check.cjs
node tests/company-selection-check.cjs
```
Os workflows instalam Playwright para a verificação visual/responsiva. Os testes existentes cobrem um conjunto limitado de comportamentos e não substituem testes de integração reais de Auth, RLS, Storage e banco.

### Flutter
```sh
cd apps/mobile_flutter
flutter pub get
flutter analyze
flutter test
```
O workflow Android também constrói APK release e verifica pacote e assinatura. O projeto Android host é gerado durante o workflow.

## Evidências de CI da auditoria
Na auditoria anterior à criação desta documentação foram observados:
- Build React bem-sucedido: workflow run 42248488536.
- Verificações visuais React bem-sucedidas: workflow run 42248488545.
- Build Flutter bem-sucedido em commit anterior: workflow run 42171147368.
- A validação de assinatura teve falha na etapa de emulador/ADB; etapas anteriores de assinatura, build e versão passaram.

Essas evidências são históricas. Antes de release, reexecute os workflows no HEAD candidato. Não declarar que os testes foram executados localmente nesta etapa documental.

## Matriz mínima por mudança
| Área alterada | Validação esperada |
|---|---|
| Componentes/telas React | Build, testes web relacionados e regressão responsiva |
| Autenticação/sessão | Login, logout, recuperação, expiração e troca de empresa |
| Dados/RPC/RLS | Autorização por papel e empresa, casos positivos/negativos e concorrência |
| Storage/imagens | Upload, leitura, exclusão autorizada e isolamento |
| Flutter | Analyze, unit tests, build APK e fluxos em aparelho |
| Android release | applicationId, versionCode/versionName, assinatura e atualização sobre instalação existente |
| Edge Functions | JWT, validação de entrada, autorização e respostas de erro |
| Migrações | Revisão SQL, estado remoto, backup/rollback e teste em ambiente seguro |

## Critérios de encerramento
- Diff limitado ao escopo aprovado.
- Testes aplicáveis executados no commit candidato.
- Resultado e limitações documentados.
- Nenhum secret ou arquivo de build no diff.
- Sem push, merge, deploy ou release sem autorização.
