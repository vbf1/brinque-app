import { useState } from 'react';

const PIX_KEY = '148.567.896-00';
const PRICE = 'R$ 10,00';

export function CheckoutPage() {
  const [copied, setCopied] = useState(false);
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');

  async function copyPix() {
    try {
      await navigator.clipboard.writeText(PIX_KEY);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="kidsloc-checkout">
      <header className="kc-topbar">
        <a className="kc-brand" href="./"><span className="kc-mark">✦</span><span>KIDSLOC <b>APP</b></span></a>
        <span className="kc-secure">✦ Acesso simples e prático</span>
      </header>

      <section className="kc-hero">
        <div className="kc-hero-copy">
          <span className="kc-eyebrow">GESTÃO INTELIGENTE PARA LOCAÇÃO DE BRINQUEDOS</span>
          <h1>Mais controle para sua empresa. <em>Mais tranquilidade</em> no seu dia.</h1>
          <p>Organize suas locações, clientes, brinquedos, equipe e financeiro em um só lugar.</p>
          <a className="kc-cta" href="#assinar">Quero começar agora <span>→</span></a>
          <div className="kc-proof"><span>✓</span> Gestão centralizada <span>✓</span> Acesso pelo celular e computador</div>
        </div>
        <div className="kc-preview" aria-label="Resumo visual dos recursos do KidsLoc">
          <div className="kc-preview-head"><span>✦ Visão geral</span><i>● ● ●</i></div>
          <div className="kc-preview-title">Seu negócio em ordem</div>
          <div className="kc-stats"><div><small>Locações</small><strong>Agenda</strong><span>Reservas e entregas</span></div><div><small>Clientes</small><strong>Cadastro</strong><span>Histórico organizado</span></div></div>
          <div className="kc-feature-line"><span>▣</span><div><b>Controle de brinquedos</b><small>Produtos e disponibilidade</small></div><i>✓</i></div>
          <div className="kc-feature-line"><span>＄</span><div><b>Financeiro</b><small>Entradas e saídas</small></div><i>✓</i></div>
          <div className="kc-feature-line"><span>✎</span><div><b>Contratos</b><small>Documentos e assinaturas</small></div><i>✓</i></div>
        </div>
      </section>

      <section className="kc-benefits">
        <article><span>▣</span><b>Locações organizadas</b><p>Acompanhe reservas, datas e itens de cada aluguel.</p></article>
        <article><span>♙</span><b>Clientes e equipe</b><p>Mantenha informações e comunicação em um só lugar.</p></article>
        <article><span>✎</span><b>Contratos digitais</b><p>Prepare contratos e acompanhe o processo de assinatura.</p></article>
        <article><span>＄</span><b>Visão financeira</b><p>Registre movimentações e acompanhe seu negócio.</p></article>
      </section>

      <section className="kc-checkout-wrap" id="assinar">
        <div className="kc-checkout-intro">
          <span className="kc-eyebrow">PLANO MENSAL</span>
          <h2>Comece a organizar sua operação hoje.</h2>
          <p>Preencha seus dados e faça o Pix. A liberação do acesso será realizada manualmente após a conferência do pagamento.</p>
          <ul><li>✓ Acesso ao KidsLoc App</li><li>✓ Recursos de gestão em um só lugar</li><li>✓ Pagamento mensal via Pix</li></ul>
        </div>
        <div className="kc-payment-card">
          <div className="kc-plan-label">ASSINATURA MENSAL</div>
          <div className="kc-price"><strong>R$ 10</strong><span>,00 <small>/ mês</small></span></div>
          <p className="kc-price-note">Pagamento manual via Pix</p>
          <label htmlFor="kc-name">Seu nome</label>
          <input id="kc-name" value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Como podemos te chamar?" autoComplete="name" />
          <label htmlFor="kc-email">Seu e-mail</label>
          <input id="kc-email" type="email" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} placeholder="voce@email.com" autoComplete="email" />
          <div className="kc-pix-box">
            <div className="kc-pix-title"><span>▦</span><div><b>Pague com Pix</b><small>Use a chave abaixo no aplicativo do seu banco</small></div></div>
            <div className="kc-pix-key"><span>{PIX_KEY}</span><button type="button" onClick={copyPix}>{copied ? 'Copiado ✓' : 'Copiar chave'}</button></div>
            <div className="kc-pix-value"><span>Valor do Pix</span><b>{PRICE}</b></div>
          </div>
          <div className="kc-payment-steps"><b>Como finalizar</b><ol><li>Copie a chave Pix e faça o pagamento de R$ 10,00.</li><li>Guarde o comprovante da transferência.</li><li>Entre em contato com o responsável pelo KidsLoc e informe seu nome e e-mail para conferência e liberação.</li></ol></div>
          <button className="kc-copy-bottom" type="button" onClick={copyPix}>{copied ? 'Chave Pix copiada!' : 'Copiar chave Pix para pagar'}</button>
          <small className="kc-manual-note">A confirmação é manual. O envio do Pix não libera o acesso automaticamente.</small>
        </div>
      </section>
      <footer className="kc-footer"><b>KIDSLOC APP</b><span>Gestão de locações de brinquedos</span></footer>
    </main>
  );
}
