# KidsLoc App — Mobile Flutter

Base inicial da futura aplicação Android em Flutter.

## Estado desta etapa
- Estrutura Flutter isolada da versão web/Capacitor atual.
- Tema Material 3 inicial.
- Teste de widget básico.
- Nenhuma conexão com produção foi inicializada nesta etapa.

## Próximas etapas
1. Configurar Supabase Auth usando o projeto existente.
2. Validar login, recuperação de senha, persistência e logout.
3. Migrar os módulos por domínio, preservando tabelas, RLS e Edge Functions.
4. Integrar FCM nativo com o projeto Firebase e o pacote Android existentes.
5. Executar testes comparativos antes de liberar qualquer versão.

## Executar localmente
```sh
flutter pub get
flutter analyze
flutter test
flutter run
```

Não colocar chaves secretas no aplicativo. A URL e a chave pública do Supabase serão fornecidas por configuração segura de build quando a integração for implementada.
