# Inventário de migrações e estado do banco

## Escopo
Registro da divergência identificada na auditoria entre o histórico do projeto Supabase e os arquivos SQL presentes no Git. Este documento não executa nem autoriza migrações.

## Snapshot da auditoria
- Projeto Supabase: `wcxvswomcfpeuhnbxivh`.
- Tabelas identificadas: 35; RLS habilitado em todas as tabelas consultadas.
- Histórico remoto: 38 migrações registradas.
- Arquivos SQL versionados no repositório: 23.
- Comparação por nome na auditoria: 19 migrações registradas remotamente sem arquivo correspondente no repositório; 4 arquivos SQL versionados sem correspondência no histórico aplicado.

As contagens e diferenças são um snapshot e precisam ser atualizadas antes de qualquer operação de banco. Não concluir que uma migração ausente deve ser reaplicada: o estado real pode ter sido alterado por outras vias ou o histórico pode ter sido reconciliado depois da auditoria.

## Risco
Executar `db push`, reaplicar SQL, renomear migrações ou reconstruir o histórico sem reconciliação pode duplicar objetos, falhar parcialmente ou alterar permissões/dados de produção.

## Procedimento obrigatório antes de migrar
1. Consultar novamente o histórico remoto e listar todos os arquivos SQL versionados.
2. Comparar identificador, nome, checksum/conteúdo e ordem.
3. Inspecionar schema, policies, triggers, RPCs, buckets e dependências reais.
4. Classificar cada diferença como aplicada sem arquivo, arquivo não aplicado, divergência de nome/conteúdo ou alteração manual.
5. Preparar plano por migração com impacto e rollback.
6. Testar em ambiente isolado quando disponível.
7. Obter aprovação explícita antes de executar qualquer alteração remota.

## Proibições
- Não apagar nem renomear migrações existentes como forma de resolver divergências.
- Não alterar tabelas, dados, RLS, funções, buckets ou triggers durante auditoria documental.
- Não tratar este inventário como fonte definitiva do schema; consultar o projeto Supabase para o estado atual.
