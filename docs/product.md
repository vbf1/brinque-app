# Produto — KidsLoc App

## Identidade
- Produto: KidsLoc App.
- Empresa de referência: Sonho Kids Brinquedos.
- Segmento operacional atual: locação de brinquedos.
- Região de atendimento informada pela empresa: Contagem, Belo Horizonte e região.

## Objetivo
Apoiar a operação de locação de brinquedos com gestão de empresas, usuários, clientes, estoque, locações, agenda, financeiro, orçamentos, contratos, ocorrências e comunicação da equipe.

## Áreas identificadas no repositório
- Autenticação e seleção de empresa.
- Funcionários/usuários e permissões.
- Clientes.
- Estoque/produtos.
- Locações e itens, com responsáveis e endereço de entrega.
- Agenda e lembretes.
- Financeiro e pagamentos.
- Orçamentos.
- Contratos e página pública de contrato.
- Ocorrências e fotos.
- Chat da equipe.
- Estatísticas.
- Marketing e anúncios.

A lista indica módulos identificados no código, não garante que cada recurso esteja habilitado, completo ou com paridade entre web e Flutter. Para estado por plataforma, consulte a auditoria de paridade.

## Papéis e acesso
O produto possui papéis de proprietário/administrador/gerente/funcionário em diferentes fluxos. A matriz definitiva de permissões deve ser verificada nas políticas RLS e no código server-side; não inferir autorização apenas pela visibilidade de botões.

## Requisitos permanentes
- Isolamento dos dados por empresa.
- Preservação de locações com múltiplos itens e controle transacional de estoque.
- Visibilidade das locações de acordo com papel e atribuição de responsáveis.
- Preservação de dados e sessão durante atualizações.
- Experiência web e Android consistente.
- Não ampliar o escopo comercial para atrações sem solicitação explícita.

## Estado e evolução
A aplicação React é o fluxo web funcional. O APK Flutter atual carrega o site em WebView, apesar de existirem módulos Flutter nativos. A ativação do fluxo Flutter nativo depende de paridade, validação e aprovação. Consulte `docs/mobile-web-parity-audit.md`.
