# Publicação de atualizações Android do KidsLoc

O APK de distribuição será publicado em GitHub Releases.

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

## Publicar uma versão
Depois de cadastrar os quatro segredos, abra Actions → Publish KidsLoc Android Release → Run workflow. Informe a versão (ex.: 1.0.1) e as notas. O workflow compila, analisa, testa e cria uma GitHub Release com o APK assinado.

## Atualizador dentro do app
O canal de Releases será a fonte oficial das versões. O verificador dentro do aplicativo consultará a API de Releases e oferecerá o download do APK. O Android sempre exige confirmação do usuário para instalar sideload e pode exigir permissão para instalar apps desconhecidos.
