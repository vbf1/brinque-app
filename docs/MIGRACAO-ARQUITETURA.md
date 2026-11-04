# Migração do KidsLoc App — arquitetura de destino

## Decisão de arquitetura
- Mobile Android: Flutter.
- Desktop e navegador: React + TypeScript.
- Backend compartilhado: projeto Supabase já existente.
- Notificações Android: Firebase Cloud Messaging no projeto Firebase atual.
- Repositório atual: manter a aplicação web/Capacitor funcionando até a substituição completa ser aprovada.

## Estrutura
```text
apps/
  mobile_flutter/   # Flutter para Android
  desktop_react/    # React + TypeScript para desktop/web
docs/
  MIGRACAO-ARQUITETURA.md
```

## Regras obrigatórias
1. Não recriar nem apagar tabelas existentes.
2. Não alterar RLS, triggers, RPCs, buckets ou Edge Functions sem aprovação explícita.
3. Reutilizar Supabase Auth para preservar contas e credenciais.
4. Nunca colocar service_role/secret key em aplicativos cliente.
5. Migrar cada módulo com testes de paridade antes de avançar.
6. Manter a versão atual publicada até a nova versão atingir paridade e receber autorização para substituição.
7. Preservar locações com múltiplos brinquedos e edição transacional dos itens.
8. Preservar notificações push Android, incluindo execução em segundo plano e tokens FCM.
9. Manter ferramentas e serviços gratuitos; não ativar planos pagos nem autorizar cobranças.

## Etapas
- [x] Criar bases isoladas Flutter e React.
- [ ] Auditar autenticação, políticas RLS, buckets, funções e fluxos de dados.
- [ ] Implementar autenticação compartilhada no Flutter e React.
- [ ] Migrar módulos e regras de negócio.
- [ ] Integrar notificações nativas Flutter/FCM.
- [ ] Criar testes automatizados e comparativos.
- [ ] Validar APK instalado e desktop/web.
- [ ] Planejar substituição total somente após aprovação.

## Estado
Esta etapa cria apenas a estrutura inicial. Não substitui nem altera o aplicativo atualmente publicado.
