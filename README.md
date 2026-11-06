# KidsLoc App — Sonho Kids Brinquedos

Sistema de gestão de locações de brinquedos da Sonho Kids Brinquedos. O repositório contém a aplicação web React/TypeScript, um projeto Android Flutter em evolução, funções serverless Supabase, migrações SQL e testes automatizados.

> **Estado importante:** a aplicação web React é o fluxo funcional publicado. O projeto Flutter possui módulos nativos, mas o fluxo principal do APK atualmente abre a aplicação web dentro de uma WebView. A ativação do shell Flutter nativo depende de paridade funcional e validação aprovadas. Consulte [a auditoria de paridade](docs/mobile-web-parity-audit.md).

## Estrutura do repositório

```text
apps/
  desktop_react/       # React + TypeScript + Vite
  mobile_flutter/      # Aplicativo Android Flutter e módulos nativos
supabase/
  functions/           # Edge Functions
  migrations/          # Arquivos SQL versionados
tests/                 # Verificações automatizadas existentes
docs/                  # Arquitetura, produto, segurança e operação
.github/workflows/     # CI, validações, APK e publicação web
```

## Tecnologias e serviços
- Web: React 19, TypeScript 5.8 e Vite 6.
- Android: Flutter/Dart, com WebView no fluxo principal atual.
- Backend: Supabase Auth, PostgreSQL, PostgREST/RPC, Storage e Edge Functions.
- Push: Firebase Cloud Messaging está integrado ao projeto; o estado de validação do fluxo nativo deve ser conferido antes de qualquer promessa de funcionamento.
- CI: GitHub Actions.

## Executar a aplicação web

Requisitos: Node.js 22 (conforme workflows) e npm.

```sh
cd apps/desktop_react
npm ci
npm run dev
```

Build de produção local:

```sh
npm run build
npm run preview
```

O build executa `tsc -b && vite build`. As configurações Supabase são fornecidas por variáveis de ambiente; consulte `apps/desktop_react/.env.example`. Nunca use chaves secret/service_role no cliente.

## Executar o projeto Flutter

Requisitos: Flutter estável compatível com Dart 3.9+, Android SDK e Java 21 para o pipeline Android.

```sh
cd apps/mobile_flutter
flutter pub get
flutter analyze
flutter test
flutter run
```

O workflow de APK gera o projeto host Android durante a execução e valida o pacote `br.com.sonhokids.kidsloc` e a assinatura configurada no CI. Não substitua a chave de assinatura.

## Backend Supabase
O Supabase existente é o backend compartilhado. A aplicação usa SDKs cliente, APIs PostgREST/RPC, Auth e Storage; isso não significa acesso SQL direto pelo navegador ou pelo APK. As regras de acesso dependem de RLS e das validações das Edge Functions.

Consulte:
- [Arquitetura](docs/architecture.md)
- [Contratos e API](docs/api.md)
- [Segurança](docs/security.md)
- [Inventário de migrações](docs/database-migration-inventory.md)

## Testes e validação

```sh
cd apps/desktop_react
npm ci
npm run build
```

```sh
cd apps/mobile_flutter
flutter pub get
flutter analyze
flutter test
```

Os testes React adicionais existentes ficam em `tests/` e são executados pelo workflow visual. Consulte [Testing](docs/testing.md) para o escopo e as limitações atuais. Não considere um workflow antigo como prova de validação do HEAD atual.

## Publicação
A publicação web é automatizada pelo workflow `.github/workflows/deploy-react-pages.yml` em pushes na `main` que alteram a aplicação React. O APK é construído pelo workflow `.github/workflows/build-flutter-apk.yml`. Não faça merge, push, deploy ou release sem aprovação explícita.

URL web atual: https://vbf1.github.io/kidsloc-app/

## Regras para contribuições
Leia primeiro [AGENTS.md](AGENTS.md). Mudanças devem ser pequenas, compatíveis, testadas e documentadas. Não executar migrações nem alterar dados, RLS, autenticação, assinatura Android, secrets ou publicação sem aprovação específica.
