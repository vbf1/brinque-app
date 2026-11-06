# Registro de decisões técnicas

Este documento registra decisões de arquitetura e restrições que devem orientar mudanças futuras. Decisões podem ser revistas somente com justificativa, análise de impacto e aprovação.

## ADR-001 — Supabase permanece como backend compartilhado
- **Status:** vigente.
- **Decisão:** manter o projeto Supabase existente para Auth, PostgreSQL, RLS, Storage, PostgREST/RPC e Edge Functions.
- **Motivo:** web e mobile já dependem dele; substituir ou duplicar backend aumentaria risco e custo.
- **Consequência:** consolidar contratos gradualmente, sem criar servidor dedicado por padrão.

## ADR-002 — Web React permanece publicada durante a migração mobile
- **Status:** vigente.
- **Decisão:** não substituir o fluxo principal Android por telas Flutter nativas até que a paridade funcional e os fluxos críticos estejam validados e aprovados.
- **Motivo:** o APK atual carrega React em WebView e módulos Flutter ainda não cobrem todo o produto.
- **Consequência:** mudanças Flutter devem preservar o fluxo publicado e permitir comparação por módulo.

## ADR-003 — Compatibilidade de instalação Android
- **Status:** vigente.
- **Decisão:** preservar applicationId `br.com.sonhokids.kidsloc`, chave de assinatura e caminho de atualização existente.
- **Motivo:** permitir atualização sobre instalações existentes e preservar dados.
- **Consequência:** qualquer alteração de assinatura, identidade de pacote ou estratégia de release exige aprovação explícita.

## ADR-004 — Segurança e migrações conservadoras
- **Status:** vigente.
- **Decisão:** não aplicar correções em lote a avisos de advisors nem executar migrações enquanto o histórico remoto e os SQL versionados não forem reconciliados.
- **Motivo:** políticas, funções e índices podem ter dependências ou intenção de negócio.
- **Consequência:** auditoria individual, evidência, plano de rollback e autorização antes de alterações.

## ADR-005 — Prioridade para ferramentas gratuitas
- **Status:** vigente.
- **Decisão:** priorizar opções gratuitas e não contratar serviços ou planos sem autorização expressa.
- **Motivo:** restrição operacional e financeira do projeto.
- **Consequência:** apresentar limites e alternativas gratuitas antes de propor serviços pagos.
