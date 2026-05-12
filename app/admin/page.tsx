'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

type StatusAgendamento = 'pendente' | 'confirmado' | 'concluido' | 'cancelado'

type Agendamento = {
  id: string
  data: string
  horario: string
  status: StatusAgendamento
  observacoes: string | null
  clientes: { nome: string; whatsapp: string } | null
  servicos: { nome: string } | null
}

const serif = { fontFamily: 'var(--font-cormorant), Georgia, serif' } as const
const sans = { fontFamily: 'var(--font-dm-sans), sans-serif' } as const

const STATUS_CFG: Record<
  StatusAgendamento,
  { label: string; bg: string; text: string; border: string }
> = {
  pendente:   { label: 'Pendente',   bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200'  },
  confirmado: { label: 'Confirmado', bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
  concluido:  { label: 'Concluído',  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200'  },
  cancelado:  { label: 'Cancelado',  bg: 'bg-red-50',    text: 'text-red-400',    border: 'border-red-200'    },
}

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MESES_ABREV = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

function formatarData(dateStr: string) {
  const [ano, mes, dia] = dateStr.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  return `${DIAS[d.getDay()]}, ${dia} ${MESES_ABREV[mes - 1]}.`
}

function CardAgendamento({
  item,
  showDate,
  onAction,
}: {
  item: Agendamento
  showDate: boolean
  onAction: (id: string, status: StatusAgendamento) => Promise<void>
}) {
  const [atualizando, setAtualizando] = useState(false)
  const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.pendente

  async function handle(status: StatusAgendamento) {
    setAtualizando(true)
    await onAction(item.id, status)
    setAtualizando(false)
  }

  const podeAcionar = item.status !== 'concluido' && item.status !== 'cancelado'

  return (
    <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {showDate && (
            <p
              className="text-[10px] text-[#C9A96E] tracking-[0.2em] uppercase mb-1"
              style={sans}
            >
              {formatarData(item.data)}
            </p>
          )}
          <p
            className="font-semibold text-[#1A1612] text-base leading-tight truncate"
            style={sans}
          >
            {item.clientes?.nome ?? '—'}
          </p>
          <p className="text-stone-400 text-xs mt-0.5" style={sans}>
            {item.clientes?.whatsapp ?? '—'}
          </p>
        </div>
        <span
          className={`text-[10px] px-2.5 py-1 rounded-full border font-medium tracking-wider uppercase whitespace-nowrap shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}
          style={sans}
        >
          {cfg.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm text-stone-500 mb-3" style={sans}>
        <span className="font-semibold text-[#1A1612]">{item.horario.slice(0, 5)}</span>
        <span className="text-stone-300">·</span>
        <span>{item.servicos?.nome ?? '—'}</span>
      </div>

      {item.observacoes && (
        <p className="text-xs text-stone-400 italic mb-3 leading-relaxed" style={sans}>
          {item.observacoes}
        </p>
      )}

      {podeAcionar && (
        <div className="flex gap-2 pt-3 border-t border-stone-50">
          {item.status === 'pendente' && (
            <button
              onClick={() => handle('confirmado')}
              disabled={atualizando}
              className="flex-1 py-2 rounded-xl text-[10px] tracking-[0.2em] uppercase font-medium bg-[#1A1612] text-[#F9F5EF] disabled:opacity-40 hover:bg-[#2c231a] transition-colors"
              style={sans}
            >
              Confirmar
            </button>
          )}
          {item.status === 'confirmado' && (
            <button
              onClick={() => handle('concluido')}
              disabled={atualizando}
              className="flex-1 py-2 rounded-xl text-[10px] tracking-[0.2em] uppercase font-medium bg-green-600 text-white disabled:opacity-40 hover:bg-green-700 transition-colors"
              style={sans}
            >
              Concluir
            </button>
          )}
          <button
            onClick={() => handle('cancelado')}
            disabled={atualizando}
            className="py-2 px-4 rounded-xl text-[10px] tracking-[0.2em] uppercase font-medium text-red-400 border border-red-100 hover:bg-red-50 disabled:opacity-40 transition-colors"
            style={sans}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

function Secao({
  titulo,
  items,
  loading,
  showDate,
  vazio,
  onAction,
}: {
  titulo: string
  items: Agendamento[]
  loading: boolean
  showDate: boolean
  vazio: string
  onAction: (id: string, status: StatusAgendamento) => Promise<void>
}) {
  return (
    <section>
      <div className="flex items-center gap-4 mb-5">
        <h2 className="text-2xl font-light italic text-[#1A1612] shrink-0" style={serif}>
          {titulo}
        </h2>
        <div className="h-px flex-1 bg-stone-200" />
        {!loading && items.length > 0 && (
          <span
            className="text-[10px] text-stone-400 tracking-wider shrink-0"
            style={sans}
          >
            {items.length} {items.length === 1 ? 'agendamento' : 'agendamentos'}
          </span>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-stone-400 text-sm py-6" style={sans}>
          <div className="w-4 h-4 border-2 border-stone-300 border-t-[#C9A96E] rounded-full animate-spin" />
          Carregando...
        </div>
      ) : items.length === 0 ? (
        <p className="text-stone-400 text-sm py-6" style={sans}>
          {vazio}
        </p>
      ) : (
        <div className="grid gap-3">
          {items.map((item) => (
            <CardAgendamento
              key={item.id}
              item={item}
              showDate={showDate}
              onAction={onAction}
            />
          ))}
        </div>
      )}
    </section>
  )
}

export default function AdminPage() {
  const router = useRouter()
  const sbRef = useRef<SupabaseClient | null>(null)
  if (!sbRef.current) {
    sbRef.current = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  const sb = sbRef.current

  const [hoje, setHoje] = useState<Agendamento[]>([])
  const [proximos, setProximos] = useState<Agendamento[]>([])
  const [loading, setLoading] = useState(true)

  const hojeStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    sb.auth.getSession().then(({ data, error }) => {
      if (error) {
        console.error('[Admin] erro ao obter sessão:', error.message)
      } else if (data.session) {
        console.log('[Admin] sessão ativa — user:', data.session.user.email)
      } else {
        console.warn('[Admin] sem sessão autenticada no contexto do componente')
      }
    })
  }, [sb])

  const fetchData = useCallback(async () => {
    setLoading(true)
    const select = 'id, data, horario, status, observacoes, clientes(nome, whatsapp), servicos(nome)'

    const [resHoje, resProximos] = await Promise.all([
      sb
        .from('agendamentos')
        .select(select)
        .eq('data', hojeStr)
        .order('horario'),
      sb
        .from('agendamentos')
        .select(select)
        .gt('data', hojeStr)
        .neq('status', 'cancelado')
        .order('data')
        .order('horario')
        .limit(10),
    ])

    if (resHoje.error) console.error('[Admin] erro query hoje:', resHoje.error)
    if (resProximos.error) console.error('[Admin] erro query proximos:', resProximos.error)

    setHoje((resHoje.data as unknown as Agendamento[]) ?? [])
    setProximos((resProximos.data as unknown as Agendamento[]) ?? [])
    setLoading(false)
  }, [sb, hojeStr])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  async function handleAction(id: string, status: StatusAgendamento) {
    const { error } = await sb.from('agendamentos').update({ status }).eq('id', id)
    if (error) console.error('[Admin] erro ao atualizar status:', error)
    await fetchData()
  }

  async function handleLogout() {
    await sb.auth.signOut()
    router.push('/admin/login')
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F9F5EF' }}>
      <header style={{ backgroundColor: '#1A1612' }} className="px-6 py-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div>
            <p
              className="text-[#C9A96E] text-[10px] tracking-[0.4em] uppercase mb-1"
              style={sans}
            >
              Painel
            </p>
            <h1 className="text-2xl font-light text-[#F9F5EF]" style={serif}>
              Luana Miniuk Studio
            </h1>
          </div>
          <button
            onClick={handleLogout}
            className="text-[10px] tracking-[0.25em] uppercase text-stone-400 hover:text-[#C9A96E] transition-colors border border-stone-700 px-4 py-2 rounded-xl"
            style={sans}
          >
            Sair
          </button>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8 space-y-10">
        <Secao
          titulo="Hoje"
          items={hoje}
          loading={loading}
          showDate={false}
          vazio="Nenhum agendamento para hoje."
          onAction={handleAction}
        />
        <Secao
          titulo="Próximos agendamentos"
          items={proximos}
          loading={loading}
          showDate={true}
          vazio="Nenhum agendamento futuro."
          onAction={handleAction}
        />
      </main>
    </div>
  )
}
