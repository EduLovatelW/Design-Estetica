"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Servico = {
  id: string;
  nome: string;
  duracao_min: number;
  preco_base: number;
};

type Step = 1 | 2 | 3 | 4;

const MESES = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho",
               "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const SAT_SLOTS = ["09:00","09:30","10:00","10:30","11:00","11:30","12:00",
                   "12:30","13:00","13:30","14:00","14:30","15:00","15:30",
                   "16:00","16:30","17:00","17:30","18:00","18:30","19:00","19:30"];
const SUN_SLOTS = ["13:00","13:30","14:00","14:30","15:00","15:30",
                   "16:00","16:30","17:00","17:30"];

const STEPS_NAV: { n: Step; label: string }[] = [
  { n: 1, label: "Serviço" },
  { n: 2, label: "Data" },
  { n: 3, label: "Dados" },
  { n: 4, label: "Confirmação" },
];

const serif = { fontFamily: "var(--font-cormorant), Georgia, serif" } as const;
const sans  = { fontFamily: "var(--font-dm-sans), sans-serif" } as const;

export default function BookingFlow() {
  const [step, setStep] = useState<Step>(1);
  const [servicos, setServicos] = useState<Servico[]>([]);
  const [servicoSel, setServicoSel] = useState<Servico | null>(null);
  const [mes, setMes] = useState(new Date().getMonth());
  const [ano, setAno] = useState(new Date().getFullYear());
  const [dataSel, setDataSel] = useState<Date | null>(null);
  const [horarioSel, setHorarioSel] = useState<string | null>(null);
  const [horariosOcupados, setHorariosOcupados] = useState<string[]>([]);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [obs, setObs] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmado, setConfirmado] = useState(false);
  const [cancelToken, setCancelToken] = useState<string | null>(null);
  const [loadingServicos, setLoadingServicos] = useState(true);
  const [erroServicos, setErroServicos] = useState<string | null>(null);

  useEffect(() => {
    supabase.from("servicos").select("*").eq("ativo", true).then(({ data, error }) => {
      console.log("[Supabase] servicos →", { data, error });
      if (error) {
        console.error("[Supabase] erro ao buscar serviços:", error.message, "| code:", error.code);
        setErroServicos("Não foi possível carregar os serviços. Tente recarregar a página.");
      } else if (!data || data.length === 0) {
        console.warn("[Supabase] tabela servicos retornou 0 registros com ativo=true");
        setErroServicos("Nenhum serviço disponível no momento.");
      } else {
        console.log(`[Supabase] ${data.length} serviço(s) carregado(s):`, data.map(s => s.nome));
        setServicos(data);
      }
      setLoadingServicos(false);
    });
  }, []);

  useEffect(() => {
    if (!dataSel) return;
    const d = dataSel.toISOString().split("T")[0];
    supabase.from("agendamentos").select("horario")
      .eq("data", d).neq("status", "cancelado")
      .then(({ data }) => {
        if (data) setHorariosOcupados(data.map((a) => a.horario.slice(0, 5)));
      });
  }, [dataSel]);

  const slotsDisponiveis = () => {
    if (!dataSel || !servicoSel) return [];
    const dow = dataSel.getDay();
    const slots = dow === 6 ? SAT_SLOTS : SUN_SLOTS;
    const fimExpediente = dow === 6 ? 20 * 60 : 18 * 60;
    const dur = servicoSel.duracao_min + 15;
    return slots.filter((s) => {
      const [h, m] = s.split(":").map(Number);
      return h * 60 + m + dur <= fimExpediente && !horariosOcupados.includes(s);
    });
  };

  const confirmar = async () => {
    if (!servicoSel || !dataSel || !horarioSel || !nome || !whatsapp) return;
    setLoading(true);
    const { data: cliente } = await supabase.from("clientes")
      .insert({ nome, whatsapp }).select().single();
    if (cliente) {
      const { data: ag } = await supabase.from("agendamentos")
        .insert({
          cliente_id: cliente.id,
          servico_id: servicoSel.id,
          data: dataSel.toISOString().split("T")[0],
          horario: horarioSel,
          status: "pendente",
        })
        .select("cancel_token")
        .single();
      if (ag?.cancel_token) setCancelToken(ag.cancel_token as string);
    }
    setLoading(false);
    setConfirmado(true);
    setStep(4);
  };

  const maskPhone = (v: string) => {
    v = v.replace(/\D/g, "").slice(0, 11);
    if (v.length <= 2) return `(${v}`;
    if (v.length <= 7) return `(${v.slice(0,2)}) ${v.slice(2)}`;
    if (v.length <= 11) return `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
    return v;
  };

  const formatData = (d: Date) =>
    d.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });

  const renderCalendar = () => {
    const hoje = new Date(); hoje.setHours(0, 0, 0, 0);
    const primeiro = new Date(ano, mes, 1).getDay();
    const dias = new Date(ano, mes + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < primeiro; i++) cells.push(<div key={`e${i}`} />);
    for (let d = 1; d <= dias; d++) {
      const date = new Date(ano, mes, d); date.setHours(0, 0, 0, 0);
      const dow = date.getDay();
      const disponivel = (dow === 6 || dow === 0) && date >= hoje;
      const selecionado = dataSel?.toDateString() === date.toDateString();
      cells.push(
        <button
          key={d}
          disabled={!disponivel}
          onClick={() => { setDataSel(date); setHorarioSel(null); }}
          style={sans}
          className={[
            "aspect-square rounded-lg text-sm transition-all",
            !disponivel
              ? "text-stone-300 cursor-default"
              : selecionado
                ? "bg-[#2D1B33] text-[#FFF8F0] cursor-pointer font-medium"
                : "text-[#2D1B33] font-semibold cursor-pointer hover:bg-[#D4548A]/15",
          ].join(" ")}
        >
          {d}
        </button>
      );
    }
    return cells;
  };

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #F5E6F0 0%, #EDE0F5 100%)' }}>

      {/* ── HEADER ── */}
      <header className="bg-[#2D1B33] py-14 text-center px-4 sm:px-6">
        <h1 className="text-5xl font-light text-[#FFF8F0] tracking-wide leading-tight" style={serif}>
          Luana Miniuk{" "}
          <em className="font-light">Studio</em>
        </h1>
        <p className="text-[#D4548A] text-[10px] tracking-[0.45em] uppercase mt-4" style={sans}>
          Beleza &amp; Estética Avançada
        </p>
        <div className="flex items-center justify-center gap-4 mt-6">
          <div className="h-px w-16 bg-[#D4548A] opacity-40" />
          <div className="w-1.5 h-1.5 rounded-full bg-[#D4548A] opacity-60" />
          <div className="h-px w-16 bg-[#D4548A] opacity-40" />
        </div>
      </header>

      {/* ── STEPPER ── */}
      <nav className="bg-white border-b border-stone-100 py-5 px-4 sm:px-6">
        <div className="max-w-[860px] mx-auto flex items-center justify-center">
          {STEPS_NAV.map(({ n, label }, i) => {
            const done   = n < step;
            const active = n === step;
            return (
              <div key={n} className="flex items-center">
                <button
                  onClick={() => done && setStep(n)}
                  className={["flex items-center gap-2", done ? "cursor-pointer" : "cursor-default"].join(" ")}
                >
                  <span className={[
                    "w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-medium transition-all shrink-0",
                    done   ? "bg-[#D4548A] text-white"
                           : active ? "bg-[#2D1B33] text-[#FFF8F0]"
                                    : "border border-stone-300 text-stone-300",
                  ].join(" ")} style={sans}>
                    {done ? "✓" : n}
                  </span>
                  <span className={[
                    "text-[10px] tracking-[0.2em] uppercase hidden sm:block",
                    done   ? "text-[#D4548A]"
                           : active ? "text-[#2D1B33] font-semibold"
                                    : "text-stone-300",
                  ].join(" ")} style={sans}>
                    {label}
                  </span>
                </button>
                {i < STEPS_NAV.length - 1 && (
                  <div className={[
                    "w-8 md:w-14 h-px mx-3 transition-colors",
                    done ? "bg-[#D4548A]" : "bg-stone-200",
                  ].join(" ")} />
                )}
              </div>
            );
          })}
        </div>
      </nav>

      {/* ── CONTEÚDO PRINCIPAL ── */}
      <main
        className="max-w-[860px] mx-auto px-4 sm:px-6 lg:px-8 py-10"
        style={{ paddingLeft: "clamp(1rem, 4vw, 2rem)", paddingRight: "clamp(1rem, 4vw, 2rem)" }}
      >

        {/* ────────────── STEP 1 — SERVIÇO ────────────── */}
        {step === 1 && (
          <div>
            <div className="mb-8">
              <h2 className="text-4xl font-semibold text-[#2D1B33] mb-2" style={serif}>
                Escolha seu serviço
              </h2>
              <p className="text-[#2D1B33] text-sm font-medium" style={sans}>
                Selecione o procedimento que deseja realizar
              </p>
            </div>

            {/* Skeleton */}
            {loadingServicos && (
              <div className="grid grid-cols-2 gap-4">
                {[1,2,3,4].map(i => (
                  <div key={i} className="h-32 rounded-xl border border-stone-200 bg-stone-100 animate-pulse" />
                ))}
              </div>
            )}

            {/* Erro */}
            {!loadingServicos && erroServicos && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-700" style={sans}>
                {erroServicos}
              </div>
            )}

            {/* Cards */}
            {!loadingServicos && !erroServicos && (
              <div className="grid grid-cols-2 gap-4">
                {servicos.map((s) => {
                  const sel = servicoSel?.id === s.id;
                  return (
                    <button
                      key={s.id}
                      onClick={() => setServicoSel(s)}
                      className={[
                        "text-left p-5 rounded-xl border-2 bg-white transition-all",
                        sel
                          ? "border-[#D4548A] shadow-lg shadow-[#D4548A]/15"
                          : "border-stone-100 hover:border-stone-200 hover:shadow-sm",
                      ].join(" ")}
                    >
                      <div className={[
                        "w-8 h-8 rounded-lg flex items-center justify-center text-sm mb-4 transition-colors",
                        sel ? "bg-[#D4548A]/20 text-[#D4548A]" : "bg-[#FFF8F0] text-stone-400",
                      ].join(" ")}>
                        ✦
                      </div>
                      <p className="font-semibold text-[#2D1B33] text-sm mb-1 leading-snug" style={sans}>
                        {s.nome}
                      </p>
                      <p className="text-xs text-[#2D1B33] mb-1" style={sans}>
                        {s.duracao_min < 60 ? `${s.duracao_min} min` : `${s.duracao_min / 60}h`}
                      </p>
                      <p className="text-sm font-semibold text-[#D4548A]" style={sans}>
                        a partir de R$ {s.preco_base}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}

            <button
              disabled={!servicoSel}
              onClick={() => setStep(2)}
              className="w-full mt-8 bg-[#2D1B33] text-[#FFF8F0] py-4 rounded-xl text-xs tracking-[0.3em] uppercase font-medium disabled:opacity-30 transition-all hover:bg-[#4a2d5a]"
              style={sans}
            >
              Continuar →
            </button>
          </div>
        )}

        {/* ────────────── STEP 2 — DATA ────────────── */}
        {step === 2 && (
          <div>
            <div className="mb-8">
              <h2 className="text-4xl font-semibold text-[#2D1B33] mb-2" style={serif}>
                Escolha sua data
              </h2>
              <p className="text-[#2D1B33] text-sm font-medium" style={sans}>
                Selecione uma data disponível
              </p>
            </div>

            <div className="bg-white border border-stone-100 rounded-2xl p-6 mb-6 shadow-sm">
              {/* Navegação de mês */}
              <div className="flex items-center justify-between mb-6">
                <button
                  onClick={() => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); }}
                  className="w-9 h-9 rounded-full border border-stone-200 text-stone-500 hover:border-[#D4548A] hover:text-[#D4548A] transition-colors text-lg leading-none"
                >
                  ‹
                </button>
                <span className="font-medium text-[#2D1B33] tracking-wide text-sm" style={sans}>
                  {MESES[mes]} {ano}
                </span>
                <button
                  onClick={() => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); }}
                  className="w-9 h-9 rounded-full border border-stone-200 text-stone-500 hover:border-[#D4548A] hover:text-[#D4548A] transition-colors text-lg leading-none"
                >
                  ›
                </button>
              </div>

              {/* Cabeçalho dias da semana */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {["D","S","T","Q","Q","S","S"].map((d, i) => (
                  <div key={i} className="text-center text-[10px] text-stone-400 uppercase tracking-widest py-1" style={sans}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Grade do calendário */}
              <div className="grid grid-cols-7 gap-1">
                {renderCalendar()}
              </div>
            </div>

            {/* Horários */}
            {dataSel && (
              <div className="mb-6">
                <p className="text-[10px] text-stone-400 uppercase tracking-[0.3em] mb-4" style={sans}>
                  {formatData(dataSel).charAt(0).toUpperCase() + formatData(dataSel).slice(1)}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {slotsDisponiveis().length === 0
                    ? (
                      <p className="col-span-4 text-sm text-stone-400" style={sans}>
                        Nenhum horário disponível
                      </p>
                    )
                    : slotsDisponiveis().map((slot) => (
                      <button
                        key={slot}
                        onClick={() => setHorarioSel(slot)}
                        style={sans}
                        className={[
                          "py-2.5 rounded-lg border text-sm font-medium transition-all",
                          horarioSel === slot
                            ? "bg-[#2D1B33] text-[#FFF8F0] border-[#2D1B33]"
                            : "bg-white border-stone-200 text-[#2D1B33] hover:border-[#D4548A] hover:text-[#D4548A]",
                        ].join(" ")}
                      >
                        {slot}
                      </button>
                    ))
                  }
                </div>
              </div>
            )}

            <button
              disabled={!dataSel || !horarioSel}
              onClick={() => setStep(3)}
              className="w-full bg-[#2D1B33] text-[#FFF8F0] py-4 rounded-xl text-xs tracking-[0.3em] uppercase font-medium disabled:opacity-30 transition-all hover:bg-[#4a2d5a]"
              style={sans}
            >
              Continuar →
            </button>
            <button
              onClick={() => setStep(1)}
              className="w-full mt-2 py-3 text-xs text-stone-400 hover:text-stone-600 tracking-widest uppercase"
              style={sans}
            >
              ← Voltar
            </button>
          </div>
        )}

        {/* ────────────── STEP 3 — DADOS ────────────── */}
        {step === 3 && (
          <div>
            <div className="mb-8">
              <h2 className="text-4xl font-semibold text-[#2D1B33] mb-2" style={serif}>
                Insira seus dados
              </h2>
              <p className="text-[#2D1B33] text-sm font-medium" style={sans}>
                Preencha para confirmar seu agendamento
              </p>
            </div>

            {/* Resumo escuro */}
            <div className="bg-[#2D1B33] rounded-2xl p-6 mb-8 space-y-5">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#D4548A]/15 flex items-center justify-center text-[#D4548A] text-sm shrink-0 mt-0.5">
                  ✦
                </div>
                <div>
                  <p className="text-[10px] text-stone-500 uppercase tracking-[0.3em] mb-1" style={sans}>
                    Serviço
                  </p>
                  <p className="text-[#FFF8F0] text-lg font-light" style={serif}>
                    {servicoSel?.nome}
                  </p>
                </div>
              </div>
              <div className="h-px bg-white/10" />
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#D4548A]/15 flex items-center justify-center text-[#D4548A] text-sm shrink-0 mt-0.5">
                  ◷
                </div>
                <div>
                  <p className="text-[10px] text-stone-500 uppercase tracking-[0.3em] mb-1" style={sans}>
                    Data e horário
                  </p>
                  <p className="text-[#FFF8F0] text-lg font-light capitalize" style={serif}>
                    {dataSel && formatData(dataSel)} às {horarioSel}
                  </p>
                </div>
              </div>
            </div>

            {/* Campos */}
            <div className="space-y-5">
              <div>
                <label className="block text-[10px] text-[#2D1B33] font-bold uppercase tracking-[0.3em] mb-2" style={sans}>
                  Nome completo
                </label>
                <input
                  value={nome}
                  onChange={e => setNome(e.target.value)}
                  placeholder="Seu nome"
                  style={sans}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3.5 text-[#2D1B33] text-sm outline-none focus:border-[#D4548A] transition-colors placeholder:text-stone-300"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#2D1B33] font-bold uppercase tracking-[0.3em] mb-2" style={sans}>
                  WhatsApp
                </label>
                <input
                  value={whatsapp}
                  onChange={e => setWhatsapp(maskPhone(e.target.value))}
                  placeholder="(41) 99999-9999"
                  style={sans}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3.5 text-[#2D1B33] text-sm outline-none focus:border-[#D4548A] transition-colors placeholder:text-stone-300"
                />
              </div>
              <div>
                <label className="block text-[10px] text-[#2D1B33] font-bold uppercase tracking-[0.3em] mb-2" style={sans}>
                  Observações{" "}
                  <span className="normal-case tracking-normal text-stone-300">(opcional)</span>
                </label>
                <textarea
                  value={obs}
                  onChange={e => setObs(e.target.value)}
                  placeholder="Alergias, preferências..."
                  style={sans}
                  className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3.5 text-[#2D1B33] text-sm outline-none focus:border-[#D4548A] transition-colors resize-none h-24 placeholder:text-stone-300"
                />
              </div>
            </div>

            <button
              disabled={!nome || whatsapp.replace(/\D/g, "").length < 10 || loading}
              onClick={confirmar}
              className="w-full mt-8 bg-[#2D1B33] text-[#FFF8F0] py-4 rounded-xl text-xs tracking-[0.3em] uppercase font-medium disabled:opacity-30 transition-all hover:bg-[#4a2d5a]"
              style={sans}
            >
              {loading ? "Agendando..." : "Confirmar agendamento ✓"}
            </button>
            <button
              onClick={() => setStep(2)}
              className="w-full mt-2 py-3 text-xs text-stone-400 hover:text-stone-600 tracking-widest uppercase"
              style={sans}
            >
              ← Voltar
            </button>
          </div>
        )}

        {/* ────────────── STEP 4 — CONFIRMAÇÃO ────────────── */}
        {step === 4 && confirmado && (
          <div className="text-center max-w-md mx-auto py-4">
            {/* Ícone */}
            <div className="w-16 h-16 rounded-full bg-[#D4548A]/20 flex items-center justify-center mx-auto mb-6">
              <span className="text-[#D4548A] text-2xl">✓</span>
            </div>

            <h2 className="text-5xl font-semibold text-[#2D1B33] mb-3" style={serif}>
              Agendado!
            </h2>
            <p className="text-stone-400 text-sm mb-8 leading-relaxed" style={sans}>
              Seu horário foi reservado com sucesso.
              <br />Confirme pelo WhatsApp para garantir.
            </p>

            {/* Card resumo */}
            <div className="bg-white border border-stone-100 rounded-2xl p-6 text-left mb-6 shadow-sm space-y-4">
              <div>
                <p className="text-[10px] text-stone-400 uppercase tracking-[0.3em] mb-1" style={sans}>
                  Serviço
                </p>
                <p className="text-[#2D1B33] text-lg font-light" style={serif}>
                  {servicoSel?.nome}
                </p>
              </div>
              <div className="h-px bg-stone-100" />
              <div>
                <p className="text-[10px] text-stone-400 uppercase tracking-[0.3em] mb-1" style={sans}>
                  Data e horário
                </p>
                <p className="text-[#2D1B33] text-lg font-light capitalize" style={serif}>
                  {dataSel && formatData(dataSel)} às {horarioSel}
                </p>
              </div>
              <div className="h-px bg-stone-100" />
              <div>
                <p className="text-[10px] text-stone-400 uppercase tracking-[0.3em] mb-1" style={sans}>
                  Cliente
                </p>
                <p className="text-[#2D1B33] text-lg font-light" style={serif}>
                  {nome} · {whatsapp}
                </p>
              </div>
            </div>

            {/* Botão WhatsApp */}
            <a
              href={`https://wa.me/554699256686?text=${encodeURIComponent(
                `Olá Luana! 😊 Acabei de agendar:\n📌 ${servicoSel?.nome}\n📅 ${dataSel && formatData(dataSel)} às ${horarioSel}\n👤 ${nome}${cancelToken ? `\n\nCaso precise cancelar: https://design-estetica.vercel.app/cancelar/${cancelToken}` : ''}`
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              style={sans}
              className="flex items-center justify-center gap-3 w-full bg-green-500 hover:bg-green-600 text-white py-4 rounded-xl font-medium text-sm tracking-wide transition-colors"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Confirmar pelo WhatsApp
            </a>

            {/* Link de cancelamento */}
            {cancelToken && (
              <div className="mt-4 p-4 bg-stone-50 rounded-xl border border-stone-100 text-left">
                <p className="text-[10px] text-stone-400 uppercase tracking-[0.2em] mb-2" style={sans}>
                  Guarde este link para cancelar se precisar:
                </p>
                <p className="text-xs text-[#2D1B33] break-all select-all font-mono leading-relaxed">
                  https://design-estetica.vercel.app/cancelar/{cancelToken}
                </p>
              </div>
            )}

            <button
              onClick={() => {
                setStep(1);
                setConfirmado(false);
                setCancelToken(null);
                setServicoSel(null);
                setDataSel(null);
                setHorarioSel(null);
                setHorariosOcupados([]);
                setNome("");
                setWhatsapp("");
                setObs("");
              }}
              className="w-full mt-3 py-3 text-xs text-stone-400 hover:text-[#2D1B33] tracking-widest uppercase transition-colors"
              style={sans}
            >
              Fazer novo agendamento
            </button>
          </div>
        )}

      </main>
    </div>
  );
}
