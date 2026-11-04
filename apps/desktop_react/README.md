# KidsLoc App — Desktop React

Aplicação React + TypeScript + Vite.

## Autenticação nesta etapa
- Login por e-mail e senha com as contas já existentes.
- Sessão persistente no navegador e renovação automática.
- Verificação de vínculo em `company_members` e leitura de `companies`.
- Recuperação de senha e atualização após o link.
- Logout local, sem encerrar as sessões de outros dispositivos.
- Nenhuma tabela, política ou configuração do Supabase foi alterada.

A configuração usa a URL e a chave publishable já utilizadas pela aplicação atual. A chave publishable é pública e não concede privilégios administrativos; nunca use a chave service_role/secret no frontend.

## Executar
```sh
npm install
npm run dev
npm run build
```

As variáveis de `.env.example` podem ser copiadas para `.env.local`. Se não forem definidas, a configuração pública do projeto KidsLoc existente é usada como fallback.
