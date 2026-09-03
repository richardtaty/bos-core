// Landing pública de BMF Funding — branding de Business Market Finders
// (rojo #d0021b + dorado #ffd700 + Montserrat), manteniendo la identidad
// "Business Funding. Without the Phone Calls." como propuesta central.

const ROJO = "#d0021b";
const ROJO_OSCURO = "#a00215";
const DORADO = "#ffd700";
const OSCURO = "#1c1c1c";

// Abre el chat flotante (Jennifer) disparando un evento global. El widget
// `BmfChatWidget` (montado en main.tsx) escucha `bmf:open-chat` y se abre.
function abrirChat() {
  window.dispatchEvent(new Event("bmf:open-chat"));
}

const TICKER = [
  "Cash Advance",
  "Small Business Loans",
  "Equipment Financing",
  "From $50,000 to $2,000,000",
  "Business Consulting",
];

export function BmfFundingLandingPage() {
  return (
    <div className="min-h-screen bg-white text-[#1c1c1c]" style={{ fontFamily: "'Montserrat', system-ui, sans-serif" }}>
      {/* ── Nav ─────────────────────────────────────── */}
      <header className="sticky top-0 z-20 border-b border-neutral-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <div className="flex items-center gap-2.5">
            <span
              className="grid h-10 w-10 place-items-center rounded-lg text-sm font-extrabold text-white"
              style={{ backgroundColor: ROJO }}
            >
              BMF
            </span>
            <div className="leading-tight">
              <span className="block text-[15px] font-extrabold uppercase tracking-tight">Business Market Finders</span>
              <span className="block text-[11px] font-medium text-neutral-500">Funding · USA</span>
            </div>
          </div>
          <nav className="hidden items-center gap-7 text-sm font-semibold text-neutral-700 md:flex">
            <a href="#why" className="transition hover:text-[#d0021b]">Why BMF</a>
            <a href="#solutions" className="transition hover:text-[#d0021b]">Solutions</a>
            <a href="#process" className="transition hover:text-[#d0021b]">Process</a>
            <button
              onClick={abrirChat}
              className="cursor-pointer rounded-lg px-5 py-2.5 font-bold text-white transition"
              style={{ backgroundColor: ROJO }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ROJO_OSCURO)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ROJO)}
            >
              Chat with Jennifer
            </button>
          </nav>
          <button
            onClick={abrirChat}
            className="cursor-pointer rounded-lg px-4 py-2 text-sm font-bold text-white md:hidden"
            style={{ backgroundColor: ROJO }}
          >
            Chat
          </button>
        </div>
      </header>

      {/* ── Hero ───────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto max-w-6xl px-5 pt-16 pb-10 text-center md:pt-24 md:pb-14">
          <p
            className="mb-5 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-wider"
            style={{ backgroundColor: `${DORADO}22`, color: ROJO }}
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: ROJO }} />
            Expansion program for U.S. businesses
          </p>
          <h1 className="mx-auto max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
            Business Funding.{" "}
            <span className="block" style={{ color: ROJO }}>
              Without the Phone Calls.
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-neutral-600">
            Secure the capital your business needs — fast, simple, and hassle-free.
            Business Market Finders: where your business doesn't just grow, it{" "}
            <span className="font-bold" style={{ color: ROJO }}>accelerates</span>.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-4">
            <button
              onClick={abrirChat}
              className="cursor-pointer rounded-lg px-8 py-3.5 text-base font-bold text-white shadow-lg transition"
              style={{ backgroundColor: ROJO, boxShadow: `0 10px 30px -10px ${ROJO}` }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ROJO_OSCURO)}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ROJO)}
            >
              Chat with Jennifer
            </button>
            <a href="#process" className="rounded-lg border-2 border-neutral-300 px-8 py-3.5 text-base font-bold text-neutral-800 transition hover:border-[#d0021b] hover:text-[#d0021b]">
              How it works
            </a>
          </div>
          <div className="mt-7 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm font-semibold text-neutral-500">
            <span>✓ Same-day approvals</span>
            <span>✓ Funds in 48/72 hours</span>
            <span>✓ No collateral</span>
            <span>✓ $50K – $2M</span>
          </div>
        </div>

        {/* Ticker */}
        <div className="overflow-hidden py-3" style={{ backgroundColor: ROJO }}>
          <div className="flex w-max animate-marquee items-center gap-10">
            {[...TICKER, ...TICKER].map((t, i) => (
              <span key={i} className="flex items-center gap-10 whitespace-nowrap text-sm font-bold uppercase tracking-wider" style={{ color: DORADO }}>
                {t}
                <span className="text-white/60">•</span>
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* ── Why choose us ──────────────────────────── */}
      <section id="why" className="bg-neutral-50">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <p className="text-center text-sm font-extrabold uppercase tracking-widest" style={{ color: ROJO }}>
            Why choose us?
          </p>
          <h2 className="mt-3 text-center text-3xl font-extrabold leading-tight md:text-4xl">
            Don't start with $0. <span className="block" style={{ color: ROJO }}>Start with BMF.</span>
          </h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              { icon: "⚡", t: "Fast & Easy Capital", d: "An agile process to get funds quickly — ideal for urgent opportunities, without traditional banking bureaucracy." },
              { icon: "🏦", t: "Alliances with 100+ Banks", d: "Access to a wide network of lenders, maximizing your options and the chance of the best terms." },
              { icon: "⏱️", t: "Financing in 48/72 Hours", d: "Approval and disbursement in an extremely short window — crucial when time matters." },
              { icon: "✉️", t: "Email-First, No Phone Calls", d: "Everything in writing, on your schedule. You never have to call — but a human is one email away." },
            ].map((c) => (
              <div key={c.t} className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl text-2xl" style={{ backgroundColor: `${ROJO}14` }}>
                  {c.icon}
                </div>
                <h3 className="mt-4 text-lg font-bold">{c.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-neutral-600">{c.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── What makes us different ────────────────── */}
      <section className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest" style={{ color: ROJO }}>About our company</p>
            <h2 className="mt-3 text-3xl font-extrabold leading-tight md:text-4xl">What Makes Us Different?</h2>
            <ul className="mt-7 space-y-4 text-neutral-700">
              {[
                <>We finance businesses from <strong>$50,000 to $2,000,000 USD</strong> — quickly, flexibly, and without collateral.</>,
                <><strong>Same-day approvals</strong> and funds deposited in less than 24 hours.</>,
                <>Our <strong>Exclusive BMF Methodology</strong> combines capital + strategy to multiply results.</>,
                <>We work with entrepreneurs who want <strong>real solutions</strong> — not paperwork, and not phone tag.</>,
              ].map((li, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: ROJO }}>✓</span>
                  <span>{li}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {[
              { k: "$50K–$2M", v: "Funding range" },
              { k: "48/72h", v: "To funding" },
              { k: "100+", v: "Bank alliances" },
              { k: "100%", v: "Email-first" },
            ].map((s) => (
              <div key={s.k} className="rounded-2xl p-6 text-center text-white" style={{ backgroundColor: OSCURO }}>
                <div className="text-3xl font-extrabold" style={{ color: DORADO }}>{s.k}</div>
                <div className="mt-1 text-sm font-medium text-neutral-300">{s.v}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Solutions ──────────────────────────────── */}
      <section id="solutions" className="bg-neutral-50">
        <div className="mx-auto max-w-6xl px-5 py-16 md:py-24">
          <p className="text-center text-sm font-extrabold uppercase tracking-widest" style={{ color: ROJO }}>What we offer</p>
          <h2 className="mt-3 text-center text-3xl font-extrabold md:text-4xl">Smart Financing Solutions For Every Business</h2>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            {[
              { t: "Working Capital Loans", d: "Get the capital you need to optimize daily operations, manage inventory, and keep your company's liquidity — with flexible terms tailored to your business.", tag: "Fast capital for businesses" },
              { t: "Merchant Cash Advances", d: "Fast, flexible funding based on your future credit or debit card sales. Ideal for businesses that need immediate capital without the requirements of a traditional loan.", tag: "Immediate capital" },
            ].map((s) => (
              <div key={s.t} className="flex flex-col rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm">
                <span className="inline-block w-fit rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wide" style={{ backgroundColor: `${DORADO}33`, color: ROJO_OSCURO }}>
                  {s.tag}
                </span>
                <h3 className="mt-4 text-2xl font-extrabold">{s.t}</h3>
                <p className="mt-3 flex-1 leading-relaxed text-neutral-600">{s.d}</p>
                <button onClick={abrirChat} className="mt-6 inline-flex cursor-pointer items-center gap-2 text-sm font-extrabold" style={{ color: ROJO }}>
                  Chat with Jennifer <span aria-hidden>→</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Process ────────────────────────────────── */}
      <section id="process" className="mx-auto max-w-6xl px-5 py-16 md:py-24">
        <p className="text-center text-sm font-extrabold uppercase tracking-widest" style={{ color: ROJO }}>How it works</p>
        <h2 className="mt-3 text-center text-3xl font-extrabold md:text-4xl">Here's Our Process</h2>
        <div className="mt-12 grid gap-6 md:grid-cols-4">
          {[
            { n: "01", t: "Chat with Jennifer", d: "Tell Jennifer about your business and she'll guide you through the funding options. No forms, no phone calls." },
            { n: "02", t: "Review", d: "Our team reviews your business and emails you with any questions." },
            { n: "03", t: "Approval", d: "You receive your funding options in writing — no hold music, ever." },
            { n: "04", t: "Disbursement", d: "Funds deposited directly into your bank account, fast." },
          ].map((s, i) => (
            <div key={s.n} className="relative rounded-2xl border border-neutral-200 bg-white p-6">
              <div className="text-4xl font-extrabold" style={{ color: ROJO, opacity: 0.25 }}>{s.n}</div>
              <h3 className="mt-2 text-lg font-bold">{s.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-neutral-600">{s.d}</p>
              {i < 3 && (
                <span className="absolute -right-3 top-1/2 hidden -translate-y-1/2 text-2xl text-neutral-300 md:block" aria-hidden>→</span>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ────────────────────────────────────── */}
      <section style={{ backgroundColor: OSCURO }}>
        <div className="mx-auto max-w-4xl px-5 py-16 text-center md:py-20">
          <h2 className="text-3xl font-extrabold text-white md:text-4xl">Ready to Accelerate Your Business?</h2>
          <p className="mx-auto mt-4 max-w-xl text-neutral-300">
            We don't work with everyone — only with those who are ready to grow.
            Chat with Jennifer now and get a written response. No phone call required.
          </p>
          <button
            onClick={abrirChat}
            className="mt-8 inline-block cursor-pointer rounded-lg px-9 py-4 text-base font-bold text-white transition"
            style={{ backgroundColor: ROJO }}
            onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = ROJO_OSCURO)}
            onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = ROJO)}
          >
            Chat with Jennifer
          </button>
        </div>
      </section>

      {/* ── Footer ─────────────────────────────────── */}
      <footer style={{ backgroundColor: "#181818" }}>
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-14 md:grid-cols-3">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 place-items-center rounded-lg text-xs font-extrabold text-white" style={{ backgroundColor: ROJO }}>BMF</span>
              <span className="text-sm font-extrabold uppercase tracking-tight text-white">Business Market Finders</span>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-neutral-400">
              Business funding for U.S. businesses — fast, flexible, and email-first.
              "Business Funding. Without the Phone Calls."
            </p>
          </div>
          <div>
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">Quick links</h4>
            <ul className="mt-4 space-y-2 text-sm text-neutral-400">
              <li><a href="#why" className="transition hover:text-[#ffd700]">Why BMF</a></li>
              <li><a href="#solutions" className="transition hover:text-[#ffd700]">Solutions</a></li>
              <li><a href="#process" className="transition hover:text-[#ffd700]">Process</a></li>
              <li><button onClick={abrirChat} className="cursor-pointer transition hover:text-[#ffd700]">Chat with Jennifer</button></li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-extrabold uppercase tracking-wider text-white">Contact</h4>
            <ul className="mt-4 space-y-2 text-sm text-neutral-400">
              <li>Business Market Finders, Inc.</li>
              <li>Funding inquiries: by email after you apply</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/10 px-5 py-6 text-center text-xs text-neutral-500">
          <p>
            Funding is subject to review and approval. Not an offer of guaranteed approval.
            Business Market Finders is not a lender and does not make credit decisions.
          </p>
        </div>
      </footer>
    </div>
  );
}
