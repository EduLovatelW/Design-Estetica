'use client'
import { use, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

const serif = { fontFamily: 'var(--font-cormorant), Georgia, serif' } as const
const sans  = { fontFamily: 'var(--font-dm-sans), sans-serif' } as const

const DIAS        = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']

function formatarData(dateStr: string) {
  const [ano, mes, dia] = dateStr.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  return `${DIAS[d.getDay()]}, ${dia} de ${MESES_ABREV[mes - 1]}.`
}

type AgendamentoCancel = {
  id: string
  data: string
  horario: string
  status: string
  cancelado_pelo_cliente: boolean | null
  clientes: { nome: string } | null
  servicos: { nome: string } | null
}

type Estado = 'loading' | 'notfound' | 'already_cancelled' | 'active' | 'done'

export default function CancelarPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params)
  const [agendamento, setAgendamento] = useState<AgendamentoCancel | null>(null)
  const [estado, setEstado] = useState<Estado>('loading')
  const [aviso2h, setAviso2h] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [cancelando, setCancelando] = useState(false)

  useEffect(() => {
    async function buscar() {
      const { data, error } = await supabase
        .from('agendamentos')
        .select('id, data, horario, status, cancelado_pelo_cliente, clientes(nome), servicos(nome)')
        .eq('cancel_token', token)
        .single()

      if (error || !data) { setEstado('notfound'); return }

      const ag = data as unknown as AgendamentoCancel
      setAgendamento(ag)

      if (ag.status === 'cancelado') { setEstado('already_cancelled'); return }

      const [ano, mes, dia] = ag.data.split('-').map(Number)
      const [h, m] = ag.horario.slice(0, 5).split(':').map(Number)
      const diff = new Date(ano, mes - 1, dia, h, m).getTime() - Date.now()
      if (diff < 2 * 60 * 60 * 1000) setAviso2h(true)

      setEstado('active')
    }
    buscar()
  }, [token])

  async function cancelar() {
    if (!agendamento) return
    setCancelando(true)
    const { error } = await supabase
      .from('agendamentos')
      .update({ status: 'cancelado', cancelado_pelo_cliente: true })
      .eq('id', agendamento.id)
    setCancelando(false)
    if (!error) setEstado('done')
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'linear-gradient(135deg, #F5E6F0 0%, #EDE0F5 100%)' }}>
      <header className="bg-[#2D1B33] py-10 text-center px-4">
        <h1 className="text-3xl font-light text-[#FFF8F0] tracking-wide" style={serif}>Luana Miniuk Studio</h1>
        <p className="text-[#D4548A] text-[10px] tracking-[0.4em] uppercase mt-2" style={sans}>
          Cancelamento de agendamento
        </p>
      </header>

      <main className="flex-1 flex items-start justify-center px-4 pt-12 pb-16">
        <div className="w-full max-w-sm">

          {/* loading */}
          {estado === 'loading' && (
            <div className="flex items-center justify-center gap-2 text-stone-400 py-8" style={sans}>
              <div className="w-4 h-4 border-2 border-stone-300 border-t-[#D4548A] rounded-full animate-spin" />
              Carregando...
            </div>
          )}

          {/* not found */}
          {estado === 'notfound' && (
            <div className="bg-white rounded-2xl border border-stone-100 p-8 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-stone-100 flex items-center justify-center mx-auto mb-5 text-2xl text-stone-400">
                ✕
              </div>
              <h2 className="text-2xl font-light text-[#2D1B33] mb-2" style={serif}>Link inválido</h2>
              <p className="text-stone-400 text-sm leading-relaxed" style={sans}>
                Este link de cancelamento não foi encontrado ou já expirou.
              </p>
            </div>
          )}

          {/* already cancelled */}
          {estado === 'already_cancelled' && (
            <div className="bg-white rounded-2xl border border-stone-100 p-8 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-amber-50 flex items-center justify-center mx-auto mb-5 text-2xl text-amber-500">
                ○
              </div>
              <h2 className="text-2xl font-light text-[#2D1B33] mb-2" style={serif}>Já cancelado</h2>
              <p className="text-stone-400 text-sm leading-relaxed" style={sans}>
                Este agendamento já foi cancelado anteriormente.
              </p>
            </div>
          )}

          {/* active — summary + button */}
          {estado === 'active' && agendamento && !confirming && (
            <div className="space-y-4">
              <div className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm">
                <p className="text-[10px] text-stone-400 tracking-[0.25em] uppercase mb-5" style={sans}>
                  Seu agendamento
                </p>
                <div className="space-y-3">
                  <div>
                    <p className="text-[10px] text-stone-400 uppercase tracking-[0.2em] mb-0.5" style={sans}>Serviço</p>
                    <p className="text-[#2D1B33] text-xl font-light" style={serif}>{agendamento.servicos?.nome ?? '—'}</p>
                  </div>
                  <div className="h-px bg-stone-100" />
                  <div>
                    <p className="text-[10px] text-stone-400 uppercase tracking-[0.2em] mb-0.5" style={sans}>Data e horário</p>
                    <p className="text-[#2D1B33] text-xl font-light" style={serif}>
                      {formatarData(agendamento.data)} às {agendamento.horario.slice(0, 5)}
                    </p>
                  </div>
                  <div className="h-px bg-stone-100" />
                  <div>
                    <p className="text-[10px] text-stone-400 uppercase tracking-[0.2em] mb-0.5" style={sans}>Cliente</p>
                    <p className="text-[#2D1B33] text-xl font-light" style={serif}>{agendamento.clientes?.nome ?? '—'}</p>
                  </div>
                </div>
              </div>

              {aviso2h && (
                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                  <p className="text-amber-700 text-sm leading-relaxed" style={sans}>
                    <strong>Atenção:</strong> seu agendamento é em menos de 2 horas. Você ainda pode cancelar, mas considere entrar em contato direto com o studio.
                  </p>
                </div>
              )}

              <button
                onClick={() => setConfirming(true)}
                className="w-full py-4 rounded-xl text-xs tracking-[0.3em] uppercase font-medium bg-red-500 text-white hover:bg-red-600 active:bg-red-700 transition-colors"
                style={sans}
              >
                Cancelar agendamento
              </button>
            </div>
          )}

          {/* confirmation dialog */}
          {estado === 'active' && agendamento && confirming && (
            <div className="bg-white rounded-2xl border border-stone-100 p-6 shadow-sm text-center">
              <p className="text-[#2D1B33] text-xl font-light mb-2" style={serif}>Confirmar cancelamento?</p>
              <p className="text-stone-400 text-sm mb-6 leading-relaxed" style={sans}>
                Esta ação não pode ser desfeita. Seu horário ficará disponível para outras clientes.
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirming(false)} disabled={cancelando}
                  className="flex-1 py-3 rounded-xl text-[10px] tracking-[0.2em] uppercase text-stone-400 border border-stone-200 hover:bg-stone-50 transition-colors disabled:opacity-50"
                  style={sans}>
                  Manter
                </button>
                <button onClick={cancelar} disabled={cancelando}
                  className="flex-1 py-3 rounded-xl text-[10px] tracking-[0.2em] uppercase font-medium bg-red-500 text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
                  style={sans}>
                  {cancelando ? 'Cancelando...' : 'Sim, cancelar'}
                </button>
              </div>
            </div>
          )}

          {/* success */}
          {estado === 'done' && (
            <div className="bg-white rounded-2xl border border-stone-100 p-8 text-center shadow-sm">
              <div className="w-14 h-14 rounded-full bg-green-50 flex items-center justify-center mx-auto mb-5 text-2xl text-green-500">
                ✓
              </div>
              <h2 className="text-2xl font-light text-[#2D1B33] mb-2" style={serif}>Cancelado com sucesso</h2>
              <p className="text-stone-400 text-sm leading-relaxed" style={sans}>
                Seu agendamento foi cancelado. Para reagendar, acesse o site novamente.
              </p>
            </div>
          )}

        </div>
      </main>
    </div>
  )
}
