# KidsLoc App — Sonho Kids Brinquedos

Aplicativo web instalável (PWA), preparado para publicação no GitHub Pages e conexão com Supabase.

## O que esta versão conecta
- Login por e-mail e senha com Supabase Auth.
- Identificação da empresa e do perfil (proprietário/funcionário) por `company_members`.
- Cadastro e leitura em nuvem de clientes, brinquedos, locações, itens das locações e lançamentos financeiros.
- Atualização dos dados ao entrar no aplicativo.
- Sessão de login persistente no aparelho.
- Tela para criar uma nova senha ao abrir um link de recuperação enviado pelo Supabase.

## Publicação
1. Envie `index.html`, `manifest.webmanifest`, `sw.js` e `README.md` para a raiz do repositório GitHub.
2. No GitHub, abra **Settings → Pages**.
3. Em **Build and deployment**, escolha **Deploy from a branch**, branch `main` e pasta `/ (root)`.
4. Salve e aguarde o endereço HTTPS do GitHub Pages.

## Supabase
A aplicação usa a URL do projeto e a chave pública `publishable` no navegador. Isso é esperado para aplicações Supabase; a proteção dos dados depende de Auth e RLS no banco. Nunca coloque `service_role` ou `sb_secret` no código do navegador.

As contas precisam existir em **Authentication → Users** e estar vinculadas à empresa em `company_members`.

## Recuperação de senha
Ao abrir o link de recuperação enviado pelo Supabase, o aplicativo reconhece o evento `PASSWORD_RECOVERY` e exibe o formulário para cadastrar e confirmar uma nova senha. O endereço `https://vbf1.github.io/kidsloc-app/` deve estar cadastrado em **Authentication → URL Configuration → Site URL** e em **Redirect URLs**.

## Limitações importantes desta etapa
- A locação registra o intervalo como um único dia (data do evento).
- A disponibilidade é estimada com base nas locações já gravadas; ainda não existe bloqueio transacional para duas pessoas salvarem simultaneamente a última unidade. Confirme o estoque antes de aceitar uma reserva concorrente.
- Controle individual por número de série/unidade, pagamentos integrados, contratos e assinatura digital ainda não estão implementados.
- Esta versão não migra automaticamente cadastros antigos guardados no `localStorage`. Antes da primeira sincronização, o app guarda uma cópia dos dados locais antigos no armazenamento do navegador (`brq_legacy_backup_v1`), mas não os importa automaticamente.

## Uso
Abra o endereço HTTPS publicado, entre com a conta já cadastrada e adicione o aplicativo à tela inicial pelo menu do navegador.
