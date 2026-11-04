# KidsLoc App — Mobile Flutter

Aplicação Android em Flutter conectada ao mesmo projeto Supabase da versão atual.

## Autenticação nesta etapa
- Login por e-mail e senha com as contas existentes.
- Sessão persistida pelo SDK oficial do Supabase Flutter.
- Renovação automática e observação dos eventos de autenticação.
- Verificação do vínculo em `company_members` e leitura de `companies`.
- Solicitação de recuperação e atualização de senha quando a sessão de recuperação é recebida.
- Logout local, sem encerrar as sessões de outros dispositivos.

SDK fixado em `supabase_flutter 2.18.3` (Dart 3.9+). A URL e a chave publishable são as mesmas da aplicação atual. A chave publishable é pública; nunca incluir chave service_role/secret.

## Executar
```sh
flutter pub get
flutter analyze
flutter test
flutter run
```

Para sobrescrever a configuração:
```sh
flutter run --dart-define=SUPABASE_URL=https://SEU-PROJETO.supabase.co --dart-define=SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

O link de recuperação ainda direciona para a URL pública atual, que já possui o fluxo configurado. Deep links Android próprios serão configurados junto à migração do pacote Android/FCM.
