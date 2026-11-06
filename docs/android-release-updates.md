# Publicação de atualizações Android do KidsLoc

O APK de distribuição será publicado em GitHub Releases. O aplicativo Android consulta a versão estável mais recente pela API pública de Releases do repositório.

## Regras permanentes
- Application ID: br.com.sonhokids.kidsloc (não alterar).
- Manter a mesma chave privada de assinatura em todas as versões.
- Incrementar a versão pública X.Y.Z e o build number em todo lançamento.
- Nunca colocar o arquivo JKS, senhas ou Base64 no repositório.
- Guardar backup seguro da chave privada fora do GitHub.

## Segredos necessários
Em Settings → Secrets and variables → Actions, cadastrar:
- KIDSLOC_KEYSTORE_BASE64: conteúdo Base64 do arquivo JKS.
- KIDSLOC_KEYSTORE_PASSWORD: senha do keystore.
- KIDSLOC_KEY_ALIAS: alias da chave.
- KIDSLOC_KEY_PASSWORD: senha da chave.

Não gere uma chave nova para cada versão. A chave usada no primeiro APK assinado será a identidade de atualização do app. Se a versão instalada atualmente tiver outra assinatura, será necessária uma migração inicial, possivelmente desinstalando e instalando uma vez o APK assinado.

## Como o atualizador funciona
- Somente no Android; a versão web não exibe o aviso.
- Ao abrir o app, consulta a GitHub Release estável mais recente.
- Compara a versão publicada com a versão instalada e ignora releases de pré-lançamento.
- Exibe a versão e as notas de lançamento; o usuário pode escolher “Mais tarde”.
- Ao tocar em “Atualizar agora”, baixa o APK em armazenamento temporário e mostra o progresso.
- Entrega o arquivo ao instalador oficial do Android por meio de FileProvider.
- Se necessário, abre as configurações de autorização para instalar apps desta origem. A pessoa precisa permitir e confirmar a instalação no Android.
- Não instala em silêncio, não altera dados do app e não contorna as proteções do Android.

O atualizador só encontrará uma atualização depois que existir uma GitHub Release estável com um APK anexado.

## Publicar uma versão
Depois de cadastrar os quatro segredos, abra Actions → Publish KidsLoc Android Release → Run workflow. Informe a versão (ex.: 1.0.1) e as notas. O workflow compila, analisa, testa e cria uma GitHub Release com o APK assinado.

## Testes obrigatórios antes da distribuição
1. Compilar e analisar o app com o atualizador.
2. Verificar assinatura e applicationId do APK.
3. Instalar uma versão de teste e publicar uma versão de número maior.
4. Confirmar que o app detecta, baixa e abre o instalador Android.
5. Confirmar que a atualização mantém os dados e a sessão, se a versão anterior tiver a mesma assinatura.
