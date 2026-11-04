export default function App() {
  return (
    <main className="page-shell">
      <section className="welcome-card" aria-labelledby="page-title">
        <div className="brand-mark" aria-hidden="true">SK</div>
        <p className="eyebrow">SONHO KIDS BRINQUEDOS</p>
        <h1 id="page-title">KidsLoc App</h1>
        <p className="intro">
          Nova base desktop em React + TypeScript preparada para a migração gradual.
        </p>
        <div className="status">
          <span className="status-dot" />
          Ambiente de migração — não é a versão de produção
        </div>
        <p className="note">
          Os módulos serão migrados por etapas e continuarão utilizando o Supabase
          existente. A aplicação atual permanece independente e disponível.
        </p>
      </section>
    </main>
  );
}
