# Auditoria de paridade Web / Mobile — KidsLoc

Atualizado em 2026-11-05.

## Regras obrigatórias
- Preservar o visual existente no Web e no Android. Não redesenhar login, cores, espaçamentos, navegação ou componentes sem pedido explícito.
- Web continua em React; Android deve ser Flutter nativo. Não substituir Flutter por WebView como solução final.
- Não alterar a branch `main`; trabalhar em `prototype/first-test-build`.
- Preservar Supabase, registros existentes e políticas. Não criar migrações ou alterar tabelas sem necessidade comprovada.
- Não afirmar que algo está pronto sem build, testes e, quando necessário, validação manual no aparelho.

## Estado do runtime Android
- `AuthGate` atualmente abre `CompanyHomePage`.
- `CompanyHomePage` carrega `https://vbf1.github.io/kidsloc-app/` em WebView e sincroniza a sessão Supabase e notificações FCM.
- Portanto, o fluxo principal do APK ainda exibe React dentro da WebView. As páginas Flutter nativas existentes não são o fluxo principal.
- Não conectar o novo shell nativo ao `AuthGate` até que a paridade funcional esteja suficientemente completa e o fluxo de autenticação, recuperação de senha e notificações esteja validado. A troca prematura alteraria a experiência visual e poderia retirar funcionalidades.

## Módulos Flutter nativos
Já existiam:
- Login, clientes, estoque, locações, financeiro básico, contratos, ocorrências, chat da equipe, usuários e lembretes.

Criados nesta etapa, ainda sem conexão ao fluxo principal:
- Agenda com calendário e contagem diária.
- Estatísticas de locações, brinquedos, clientes e valores por mês.
- Cadastro de serviços com foto e preço por modalidade.
- Orçamentos com itens de brinquedos/serviços, RPC transacional, PDF e preparação de WhatsApp.
- Financeiro ampliado com recebimento vinculado à locação e recibo PDF.
- Shell de dashboard e navegação Flutter para os módulos já portados.

## Correções funcionais feitas
- Flutter agora envia `start_time` e `end_time` ao criar e atualizar locações.
- Disponibilidade de estoque e rótulo das unidades individuais consideram a hora real do período, respeitando início inclusivo e término exclusivo; locações antigas sem horário continuam ocupando o dia inteiro.
- A lógica de datas/horas foi centralizada em `lib/data/rental_time.dart` e coberta por testes unitários.
- O Financeiro nativo usa a RPC existente `register_rental_payment`, consulta o pagamento criado e gera recibo PDF. Erros ao atualizar a lista ou imprimir o recibo não devem ser apresentados como se o pagamento não tivesse sido salvo.
- Orçamentos usam a RPC existente `create_quote_with_items`; PDF e WhatsApp são preparados no dispositivo. O PDF ainda precisa ser anexado manualmente na conversa.
- Estatísticas agregam clientes e produtos por IDs do banco, evitando unir registros diferentes com nomes iguais.
- Navegação do shell nativo foi corrigida para não fechar a tela inicial ao abrir módulos pelos cartões do dashboard.

## Pendências antes de ativar o Flutter nativo
1. Portar Marketing e anúncios, incluindo configurações, aprovação, publicação assistida e Estúdio de imagens IA com consentimento explícito.
2. Conferir paridade de fotos, detalhes, edição e estados do estoque entre React e Flutter.
3. Comparar todos os campos, validações, permissões e fluxos das páginas Web e Flutter.
4. Replicar o visual atual do React no shell e nas páginas Flutter sem reformular a experiência.
5. Integrar autenticação nativa, recuperação de senha, seleção de empresa e notificações FCM sem perder os fluxos existentes.
6. Só então conectar o shell Flutter ao fluxo principal e executar testes em aparelho real, incluindo notificações em segundo plano.

## Banco e segurança
- Nesta etapa, o Supabase foi consultado, mas não recebeu alterações.
- Existem migrações aplicadas no projeto que ainda não estão representadas por arquivos SQL versionados no repositório. Reconciliar esse histórico antes de qualquer novo ambiente ou alteração estrutural.
- Os avisos do linter do Supabase (funções SECURITY DEFINER, tabela de entregas de lembretes sem política cliente, extensão pg_net no schema public, proteção de senha vazada desativada e índices ausentes) precisam de revisão específica. Não remover funções/políticas nem alterar permissões em lote: algumas podem ser intencionais e uma mudança pode bloquear o app.

## Validação
- O build React continua passando nos workflows de validação.
- Em commits intermediários desta etapa, `flutter analyze` e `flutter test` passaram; builds APK ainda estavam em execução no último acompanhamento.
- A validação final deve ser feita no HEAD mais recente da branch, não em um commit anterior.
