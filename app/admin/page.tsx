'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

// ─── types ────────────────────────────────────────────────────────────────────

type Tab = 'agenda' | 'servicos' | 'clientes' | 'financeiro' | 'bloqueios'
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

type Servico = {
  id: string
  nome: string
  duracao_min: number
  preco_base: number
  ativo: boolean
}

type AgendamentoCliente = {
  id: string
  data: string
  horario: string
  status: StatusAgendamento
  valor_cobrado: number | null
  servicos: { nome: string } | null
}

type ClienteComHistorico = {
  id: string
  nome: string
  whatsapp: string
  observacoes: string | null
  agendamentos: AgendamentoCliente[]
}

type GrupoCliente = {
  whatsapp: string
  nome: string
  primaryId: string
  observacoes: string | null
  historia: (AgendamentoCliente & { clienteNome: string })[]
  visitas_concluidas: number
  valor_total: number
}

type AgendamentoFin = {
  id: string
  data: string
  horario: string
  valor_cobrado: number | null
  clientes: { nome: string } | null
  servicos: { nome: string } | null
}

type Bloqueio = {
  id: string
  data: string
  hora_inicio: string
  hora_fim: string
  motivo: string | null
}

// ─── constants ────────────────────────────────────────────────────────────────

const serif = { fontFamily: 'var(--font-cormorant), Georgia, serif' } as const
const sans  = { fontFamily: 'var(--font-dm-sans), sans-serif' } as const

const STATUS_CFG: Record<StatusAgendamento, { label: string; bg: string; text: string; border: string }> = {
  pendente:   { label: 'Pendente',   bg: 'bg-amber-50',  text: 'text-amber-700',  border: 'border-amber-200'  },
  confirmado: { label: 'Confirmado', bg: 'bg-blue-50',   text: 'text-blue-700',   border: 'border-blue-200'   },
  concluido:  { label: 'Concluído',  bg: 'bg-green-50',  text: 'text-green-700',  border: 'border-green-200'  },
  cancelado:  { label: 'Cancelado',  bg: 'bg-red-50',    text: 'text-red-400',    border: 'border-red-200'    },
}

const DIAS        = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
const MESES_ABREV = ['jan','fev','mar','abr','mai','jun','jul','ago','set','out','nov','dez']
const MESES_FULL  = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                     'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro']

const TABS: { id: Tab; label: string }[] = [
  { id: 'agenda',     label: 'Agenda'     },
  { id: 'servicos',   label: 'Serviços'   },
  { id: 'clientes',   label: 'Clientes'   },
  { id: 'financeiro', label: 'Financeiro' },
  { id: 'bloqueios',  label: 'Bloqueios'  },
]

// ─── helpers ──────────────────────────────────────────────────────────────────

function formatarDataCurta(dateStr: string) {
  const [ano, mes, dia] = dateStr.split('-').map(Number)
  const d = new Date(ano, mes - 1, dia)
  return `${DIAS[d.getDay()]}, ${dia} ${MESES_ABREV[mes - 1]}.`
}

function nomeIniciais(nome: string) {
  return nome.trim().split(/\s+/).slice(0, 2).map(n => n[0] ?? '').join('').toUpperCase()
}

function agruparPorWhatsApp(clientes: ClienteComHistorico[]): GrupoCliente[] {
  const map = new Map<string, GrupoCliente>()
  for (const c of clientes) {
    const key = c.whatsapp
    if (!map.has(key)) {
      map.set(key, {
        whatsapp: key, nome: c.nome, primaryId: c.id,
        observacoes: c.observacoes, historia: [], visitas_concluidas: 0, valor_total: 0,
      })
    } else {
      const g = map.get(key)!
      if (!g.observacoes && c.observacoes) { g.observacoes = c.observacoes; g.primaryId = c.id }
    }
    const g = map.get(key)!
    for (const ag of c.agendamentos ?? []) {
      g.historia.push({ ...ag, clienteNome: c.nome })
      if (ag.status === 'concluido') {
        g.visitas_concluidas++
        g.valor_total += ag.valor_cobrado ?? 0
      }
    }
  }
  for (const g of map.values()) {
    g.historia.sort((a, b) =>
      a.data !== b.data ? b.data.localeCompare(a.data) : b.horario.localeCompare(a.horario)
    )
  }
  return Array.from(map.values()).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

function Spinner() {
  return (
    <div className="flex items-center gap-2 text-stone-400 text-sm py-6" style={sans}>
      <div className="w-4 h-4 border-2 border-stone-300 border-t-[#D4548A] rounded-full animate-spin" />
      Carregando...
    </div>
  )
}

function SecaoTitulo({ titulo, count }: { titulo: string; count?: number }) {
  return (
    <div className="flex items-center gap-4 mb-5">
      <h2 className="text-2xl font-light italic text-[#2D1B33] shrink-0" style={serif}>{titulo}</h2>
      <div className="h-px flex-1 bg-stone-200" />
      {count !== undefined && count > 0 && (
        <span className="text-[10px] text-stone-400 tracking-wider shrink-0" style={sans}>
          {count} {count === 1 ? 'item' : 'itens'}
        </span>
      )}
    </div>
  )
}

// ─── aba: agenda ──────────────────────────────────────────────────────────────

function CardAgendamento({
  item, showDate, onAction, muted = false,
}: {
  item: Agendamento
  showDate: boolean
  onAction: (id: string, status: StatusAgendamento) => Promise<void>
  muted?: boolean
}) {
  const [atualizando, setAtualizando] = useState(false)
  const cfg = STATUS_CFG[item.status] ?? STATUS_CFG.pendente
  const podeAcionar = !muted && item.status !== 'concluido' && item.status !== 'cancelado'

  async function handle(status: StatusAgendamento) {
    setAtualizando(true)
    await onAction(item.id, status)
    setAtualizando(false)
  }

  return (
    <div className={`rounded-2xl border p-5 transition-shadow ${
      muted
        ? 'bg-stone-50 border-stone-100 opacity-60'
        : 'bg-white border-stone-100 shadow-sm hover:shadow-md'
    }`}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {showDate && (
            <p className="text-[10px] text-[#D4548A] tracking-[0.2em] uppercase mb-1" style={sans}>
              {formatarDataCurta(item.data)}
            </p>
          )}
          <p className="font-semibold text-[#2D1B33] text-base leading-tight truncate" style={sans}>
            {item.clientes?.nome ?? '—'}
          </p>
          <p className="text-stone-400 text-xs mt-0.5" style={sans}>{item.clientes?.whatsapp ?? '—'}</p>
        </div>
        <span className={`text-[10px] px-2.5 py-1 rounded-full border font-medium tracking-wider uppercase whitespace-nowrap shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`} style={sans}>
          {cfg.label}
        </span>
      </div>

      <div className="flex items-center gap-2 text-sm text-stone-500 mb-3" style={sans}>
        <span className="font-semibold text-[#2D1B33]">{item.horario.slice(0, 5)}</span>
        <span className="text-stone-300">·</span>
        <span>{item.servicos?.nome ?? '—'}</span>
      </div>

      {item.observacoes && (
        <p className="text-xs text-stone-400 italic mb-3 leading-relaxed" style={sans}>{item.observacoes}</p>
      )}

      {podeAcionar && (
        <div className="flex gap-2 pt-3 border-t border-stone-50">
          {item.status === 'pendente' && (
            <button onClick={() => handle('confirmado')} disabled={atualizando}
              className="flex-1 py-2 rounded-xl text-[10px] tracking-[0.2em] uppercase font-medium bg-[#2D1B33] text-[#FFF8F0] disabled:opacity-40 hover:bg-[#4a2d5a] transition-colors" style={sans}>
              Confirmar
            </button>
          )}
          {item.status === 'confirmado' && (
            <button onClick={() => handle('concluido')} disabled={atualizando}
              className="flex-1 py-2 rounded-xl text-[10px] tracking-[0.2em] uppercase font-medium bg-green-600 text-white disabled:opacity-40 hover:bg-green-700 transition-colors" style={sans}>
              Concluir
            </button>
          )}
          <button onClick={() => handle('cancelado')} disabled={atualizando}
            className="py-2 px-4 rounded-xl text-[10px] tracking-[0.2em] uppercase font-medium text-red-400 border border-red-100 hover:bg-red-50 disabled:opacity-40 transition-colors" style={sans}>
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}

function SecaoAgenda({
  titulo, items, loading, showDate, vazio, onAction, muted = false,
}: {
  titulo: string; items: Agendamento[]; loading: boolean
  showDate: boolean; vazio: string
  onAction: (id: string, status: StatusAgendamento) => Promise<void>
  muted?: boolean
}) {
  return (
    <section>
      <SecaoTitulo titulo={titulo} count={loading ? undefined : items.length} />
      {loading ? <Spinner /> : items.length === 0 ? (
        <p className="text-stone-400 text-sm py-6" style={sans}>{vazio}</p>
      ) : (
        <div className="grid gap-3">
          {items.map(item => (
            <CardAgendamento key={item.id} item={item} showDate={showDate} onAction={onAction} muted={muted} />
          ))}
        </div>
      )}
    </section>
  )
}

// ─── aba: serviços ────────────────────────────────────────────────────────────

type ServicoModal = Partial<Servico> & { id?: string }

function AbaServicos({ sb }: { sb: SupabaseClient }) {
  const [servicos, setServicos] = useState<Servico[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<ServicoModal | null>(null)
  const [salvando, setSalvando] = useState(false)

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await sb.from('servicos').select('*').order('nome')
    if (error) console.error('[Serviços]', error)
    setServicos((data as Servico[]) ?? [])
    setLoading(false)
  }, [sb])

  useEffect(() => { carregar() }, [carregar])

  async function toggleAtivo(id: string, ativo: boolean) {
    await sb.from('servicos').update({ ativo: !ativo }).eq('id', id)
    await carregar()
  }

  async function salvar() {
    if (!modal) return
    setSalvando(true)
    const { id, ...campos } = modal
    if (id) {
      await sb.from('servicos').update(campos).eq('id', id)
    } else {
      await sb.from('servicos').insert({ ...campos, ativo: true })
    }
    setSalvando(false)
    setModal(null)
    await carregar()
  }

  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <h2 className="text-2xl font-light italic text-[#2D1B33] shrink-0" style={serif}>Serviços</h2>
        <div className="h-px flex-1 bg-stone-200" />
        <button onClick={() => setModal({ nome: '', duracao_min: 60, preco_base: 0 })}
          className="text-[10px] tracking-[0.2em] uppercase font-medium bg-[#2D1B33] text-[#FFF8F0] px-4 py-2 rounded-xl hover:bg-[#4a2d5a] transition-colors shrink-0" style={sans}>
          + Novo
        </button>
      </div>

      {loading ? <Spinner /> : (
        <div className="grid gap-3">
          {servicos.map(s => (
            <div key={s.id} className="bg-white rounded-2xl border border-stone-100 p-4 flex items-center gap-3 shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#2D1B33] text-sm" style={sans}>{s.nome}</p>
                <p className="text-stone-400 text-xs mt-0.5" style={sans}>
                  {s.duracao_min} min · R$ {Number(s.preco_base).toFixed(2).replace('.', ',')}
                </p>
              </div>
              <span className={`text-[10px] px-2.5 py-1 rounded-full border font-medium tracking-wider uppercase shrink-0 ${s.ativo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-stone-50 text-stone-400 border-stone-200'}`} style={sans}>
                {s.ativo ? 'Ativo' : 'Inativo'}
              </span>
              <button onClick={() => toggleAtivo(s.id, s.ativo)}
                className="text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-[#D4548A] border border-stone-200 px-3 py-1.5 rounded-xl transition-colors shrink-0" style={sans}>
                {s.ativo ? 'Desativar' : 'Ativar'}
              </button>
              <button onClick={() => setModal({ ...s })}
                className="text-[10px] tracking-[0.15em] uppercase text-stone-400 hover:text-[#2D1B33] border border-stone-200 px-3 py-1.5 rounded-xl transition-colors shrink-0" style={sans}>
                Editar
              </button>
            </div>
          ))}
        </div>
      )}

      {modal !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-2xl font-light italic text-[#2D1B33] mb-5" style={serif}>
              {modal.id ? 'Editar serviço' : 'Novo serviço'}
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] text-stone-400 mb-1 tracking-[0.2em] uppercase" style={sans}>Nome</label>
                <input value={modal.nome ?? ''}
                  onChange={e => setModal(m => ({ ...m!, nome: e.target.value }))}
                  className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-[#2D1B33] outline-none focus:border-[#D4548A] transition-colors" style={sans} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1 tracking-[0.2em] uppercase" style={sans}>Duração (min)</label>
                  <input type="number" value={modal.duracao_min ?? ''}
                    onChange={e => setModal(m => ({ ...m!, duracao_min: Number(e.target.value) }))}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-[#2D1B33] outline-none focus:border-[#D4548A] transition-colors" style={sans} />
                </div>
                <div>
                  <label className="block text-[10px] text-stone-400 mb-1 tracking-[0.2em] uppercase" style={sans}>Preço (R$)</label>
                  <input type="number" step="0.01" value={modal.preco_base ?? ''}
                    onChange={e => setModal(m => ({ ...m!, preco_base: Number(e.target.value) }))}
                    className="w-full border border-stone-200 rounded-xl px-4 py-2.5 text-sm text-[#2D1B33] outline-none focus:border-[#D4548A] transition-colors" style={sans} />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setModal(null)}
                className="flex-1 py-2.5 rounded-xl text-[10px] tracking-[0.2em] uppercase text-stone-400 border border-stone-200 hover:bg-stone-50 transition-colors" style={sans}>
                Cancelar
              </button>
              <button onClick={salvar} disabled={salvando || !modal.nome}
                className="flex-1 py-2.5 rounded-xl text-[10px] tracking-[0.2em] uppercase font-medium bg-[#2D1B33] text-[#FFF8F0] disabled:opacity-50 hover:bg-[#4a2d5a] transition-colors" style={sans}>
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── aba: clientes ────────────────────────────────────────────────────────────

function CardClienteAgrupado({
  grupo, obsEdit, salvando, onObsChange, onSalvarObs,
}: {
  grupo: GrupoCliente
  obsEdit: Record<string, string>
  salvando: Record<string, boolean>
  onObsChange: (id: string, value: string) => void
  onSalvarObs: (id: string) => void
}) {
  const [expandido, setExpandido] = useState(false)
  const obsAtual = obsEdit[grupo.primaryId] !== undefined ? obsEdit[grupo.primaryId] : (grupo.observacoes ?? '')
  const editando = obsEdit[grupo.primaryId] !== undefined
  const ini = nomeIniciais(grupo.nome)

  return (
    <div className="bg-white rounded-2xl border border-stone-100 shadow-sm overflow-hidden">
      <button onClick={() => setExpandido(e => !e)} className="w-full p-5 text-left active:bg-stone-50 transition-colors">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-sm font-semibold text-white select-none"
            style={{ background: 'linear-gradient(135deg, #D4548A 0%, #7c3aed 100%)' }}
          >
            {ini}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-[#2D1B33] text-sm leading-tight" style={sans}>{grupo.nome}</p>
            <p className="text-stone-400 text-xs mt-0.5" style={sans}>{grupo.whatsapp}</p>
          </div>
          <div className="text-right shrink-0 mr-2">
            <p className="text-sm font-semibold text-[#2D1B33]" style={sans}>
              {grupo.visitas_concluidas} {grupo.visitas_concluidas === 1 ? 'visita' : 'visitas'}
            </p>
            {grupo.valor_total > 0 && (
              <p className="text-xs text-[#D4548A]" style={sans}>
                R$ {grupo.valor_total.toFixed(2).replace('.', ',')}
              </p>
            )}
          </div>
          <span className="text-stone-300 text-xs shrink-0">{expandido ? '▲' : '▼'}</span>
        </div>
      </button>

      {expandido && (
        <div className="border-t border-stone-100 px-5 pb-5 pt-4">
          {grupo.historia.length > 0 ? (
            <div className="mb-4">
              <p className="text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-3" style={sans}>Histórico</p>
              <div className="space-y-2.5">
                {grupo.historia.map(ag => {
                  const cfg = STATUS_CFG[ag.status] ?? STATUS_CFG.pendente
                  return (
                    <div key={ag.id} className="flex items-center gap-2 text-xs" style={sans}>
                      <span className="text-stone-400 shrink-0 w-[88px]">{formatarDataCurta(ag.data)}</span>
                      <span className="flex-1 text-stone-600 truncate min-w-0">{ag.servicos?.nome ?? '—'}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-medium tracking-wider border shrink-0 ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        {cfg.label}
                      </span>
                      {ag.valor_cobrado !== null && (
                        <span className="text-stone-500 shrink-0 ml-1">
                          R$ {ag.valor_cobrado.toFixed(2).replace('.', ',')}
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <p className="text-stone-400 text-xs mb-4" style={sans}>Sem agendamentos registrados.</p>
          )}

          <div>
            <p className="text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-2" style={sans}>Observações</p>
            <div className="flex gap-2 items-end">
              <textarea
                value={obsAtual}
                onChange={e => onObsChange(grupo.primaryId, e.target.value)}
                placeholder="Observações sobre a cliente..."
                rows={2}
                className="flex-1 border border-stone-200 rounded-xl px-3 py-2 text-xs text-[#2D1B33] outline-none focus:border-[#D4548A] transition-colors resize-none placeholder:text-stone-300"
                style={sans}
              />
              {editando && (
                <button onClick={() => onSalvarObs(grupo.primaryId)} disabled={salvando[grupo.primaryId]}
                  className="py-2 px-3 rounded-xl text-[10px] tracking-[0.15em] uppercase font-medium bg-[#2D1B33] text-[#FFF8F0] disabled:opacity-50 hover:bg-[#4a2d5a] transition-colors whitespace-nowrap"
                  style={sans}>
                  {salvando[grupo.primaryId] ? '...' : 'Salvar'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function AbaClientes({ sb }: { sb: SupabaseClient }) {
  const [grupos, setGrupos] = useState<GrupoCliente[]>([])
  const [loading, setLoading] = useState(true)
  const [obsEdit, setObsEdit] = useState<Record<string, string>>({})
  const [salvando, setSalvando] = useState<Record<string, boolean>>({})

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await sb
      .from('clientes')
      .select('id, nome, whatsapp, observacoes, agendamentos(id, data, horario, status, valor_cobrado, servicos(nome))')
      .order('nome')
    if (error) console.error('[Clientes]', error)
    setGrupos(agruparPorWhatsApp((data as unknown as ClienteComHistorico[]) ?? []))
    setLoading(false)
  }, [sb])

  useEffect(() => { carregar() }, [carregar])

  async function salvarObs(id: string) {
    setSalvando(s => ({ ...s, [id]: true }))
    await sb.from('clientes').update({ observacoes: obsEdit[id] ?? '' }).eq('id', id)
    setSalvando(s => ({ ...s, [id]: false }))
    setObsEdit(o => { const n = { ...o }; delete n[id]; return n })
    await carregar()
  }

  return (
    <div>
      <SecaoTitulo titulo="Clientes" count={loading ? undefined : grupos.length} />
      {loading ? <Spinner /> : grupos.length === 0 ? (
        <p className="text-stone-400 text-sm py-6" style={sans}>Nenhum cliente cadastrado.</p>
      ) : (
        <div className="grid gap-3">
          {grupos.map(g => (
            <CardClienteAgrupado
              key={g.whatsapp}
              grupo={g}
              obsEdit={obsEdit}
              salvando={salvando}
              onObsChange={(id, val) => setObsEdit(o => ({ ...o, [id]: val }))}
              onSalvarObs={salvarObs}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── aba: financeiro ──────────────────────────────────────────────────────────

function AbaFinanceiro({ sb }: { sb: SupabaseClient }) {
  const now = new Date()
  const [ano, setAno]             = useState(now.getFullYear())
  const [mes, setMes]             = useState(now.getMonth() + 1)
  const [items, setItems]         = useState<AgendamentoFin[]>([])
  const [loading, setLoading]     = useState(true)
  const [valorEdit, setValorEdit] = useState<Record<string, string>>({})
  const [salvando, setSalvando]   = useState<Record<string, boolean>>({})

  const carregar = useCallback(async () => {
    setLoading(true)
    const mesStr = String(mes).padStart(2, '0')
    const { data, error } = await sb
      .from('agendamentos')
      .select('id, data, horario, valor_cobrado, clientes(nome), servicos(nome)')
      .eq('status', 'concluido')
      .gte('data', `${ano}-${mesStr}-01`)
      .lte('data', `${ano}-${mesStr}-31`)
      .order('data')
      .order('horario')
    if (error) console.error('[Financeiro]', error)
    setItems((data as unknown as AgendamentoFin[]) ?? [])
    setLoading(false)
  }, [sb, ano, mes])

  useEffect(() => { carregar() }, [carregar])

  async function salvarValor(id: string) {
    setSalvando(s => ({ ...s, [id]: true }))
    const v = parseFloat((valorEdit[id] ?? '').replace(',', '.'))
    await sb.from('agendamentos').update({ valor_cobrado: isNaN(v) ? null : v }).eq('id', id)
    setSalvando(s => ({ ...s, [id]: false }))
    setValorEdit(e => { const n = { ...e }; delete n[id]; return n })
    await carregar()
  }

  function navMes(delta: number) {
    let nm = mes + delta, na = ano
    if (nm > 12) { nm = 1;  na++ }
    if (nm < 1)  { nm = 12; na-- }
    setMes(nm); setAno(na)
  }

  const total   = items.length
  const receita = items.reduce((s, a) => s + (a.valor_cobrado ?? 0), 0)
  const ticket  = total > 0 ? receita / total : 0

  const semanas = [1, 2, 3, 4, 5].map(s => {
    const min = (s - 1) * 7 + 1
    const max = s * 7
    const valor = items
      .filter(a => { const d = Number(a.data.split('-')[2]); return d >= min && d <= max })
      .reduce((acc, a) => acc + (a.valor_cobrado ?? 0), 0)
    return { semana: s, label: `S${s}`, valor }
  })
  const maxBar = Math.max(...semanas.map(s => s.valor), 1)

  return (
    <div>
      <div className="flex items-center gap-4 mb-5">
        <h2 className="text-2xl font-light italic text-[#2D1B33] shrink-0" style={serif}>Financeiro</h2>
        <div className="h-px flex-1 bg-stone-200" />
        <div className="flex items-center gap-2 shrink-0">
          <button onClick={() => navMes(-1)}
            className="w-7 h-7 rounded-lg border border-stone-200 text-stone-400 hover:border-[#D4548A] hover:text-[#D4548A] transition-colors flex items-center justify-center text-base leading-none">
            ‹
          </button>
          <span className="text-xs font-medium text-[#2D1B33] w-32 text-center" style={sans}>
            {MESES_FULL[mes - 1]} {ano}
          </span>
          <button onClick={() => navMes(1)}
            className="w-7 h-7 rounded-lg border border-stone-200 text-stone-400 hover:border-[#D4548A] hover:text-[#D4548A] transition-colors flex items-center justify-center text-base leading-none">
            ›
          </button>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-5">
        {[
          { label: 'Atendimentos', value: String(total) },
          { label: 'Receita',      value: `R$ ${receita.toFixed(2).replace('.', ',')}` },
          { label: 'Ticket médio', value: total > 0 ? `R$ ${ticket.toFixed(2).replace('.', ',')}` : '—' },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-2xl border border-stone-100 p-4 text-center shadow-sm">
            <p className="text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-1" style={sans}>{c.label}</p>
            <p className="text-xl font-light text-[#2D1B33]" style={serif}>{c.value}</p>
          </div>
        ))}
      </div>

      {!loading && total > 0 && (
        <div className="bg-white rounded-2xl border border-stone-100 p-5 mb-5 shadow-sm">
          <p className="text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-4" style={sans}>
            Receita por semana
          </p>
          <div className="flex items-end gap-2 h-24">
            {semanas.map(s => (
              <div key={s.semana} className="flex-1 flex flex-col items-center gap-1">
                {s.valor > 0 && (
                  <span className="text-[9px] text-[#D4548A] font-medium" style={sans}>
                    {s.valor.toFixed(0)}
                  </span>
                )}
                <div
                  className="w-full rounded-t-lg transition-all"
                  style={{
                    height: `${Math.max(4, Math.round((s.valor / maxBar) * 68))}px`,
                    backgroundColor: s.valor > 0 ? '#D4548A' : '#e7e5e4',
                  }}
                />
                <span className="text-[9px] text-stone-400" style={sans}>{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {loading ? <Spinner /> : items.length === 0 ? (
        <p className="text-stone-400 text-sm py-6" style={sans}>
          Nenhum atendimento concluído neste mês.
        </p>
      ) : (
        <div className="grid gap-2">
          {items.map(a => {
            const editVal = valorEdit[a.id] !== undefined
              ? valorEdit[a.id]
              : (a.valor_cobrado !== null ? String(a.valor_cobrado) : '')
            const editando = valorEdit[a.id] !== undefined

            return (
              <div key={a.id} className="bg-white rounded-2xl border border-stone-100 px-5 py-3.5 flex items-center gap-3 shadow-sm">
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-[#2D1B33] text-sm truncate" style={sans}>
                    {a.clientes?.nome ?? '—'}
                  </p>
                  <p className="text-stone-400 text-xs" style={sans}>
                    {a.servicos?.nome ?? '—'} · {a.horario.slice(0, 5)} · {formatarDataCurta(a.data)}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-xs text-stone-400" style={sans}>R$</span>
                  <input
                    type="number" step="0.01"
                    value={editVal}
                    onChange={e => setValorEdit(v => ({ ...v, [a.id]: e.target.value }))}
                    className="w-24 border border-stone-200 rounded-xl px-3 py-1.5 text-sm text-right text-[#2D1B33] outline-none focus:border-[#D4548A] transition-colors"
                    style={sans} placeholder="0,00"
                  />
                  {editando && (
                    <button onClick={() => salvarValor(a.id)} disabled={salvando[a.id]}
                      className="py-1.5 px-3 rounded-xl text-[10px] tracking-[0.15em] uppercase font-medium bg-[#2D1B33] text-[#FFF8F0] disabled:opacity-50 hover:bg-[#4a2d5a] transition-colors"
                      style={sans}>
                      {salvando[a.id] ? '...' : 'OK'}
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── aba: bloqueios ───────────────────────────────────────────────────────────

function AbaBloqueios({ sb }: { sb: SupabaseClient }) {
  const hojeStr = new Date().toISOString().split('T')[0]
  const [bloqueios, setBloqueios] = useState<Bloqueio[]>([])
  const [loading, setLoading]     = useState(true)
  const [form, setForm] = useState({ data: '', hora_inicio: '', hora_fim: '', motivo: '' })
  const [salvando, setSalvando]   = useState(false)
  const [excluindo, setExcluindo] = useState<Record<string, boolean>>({})

  const carregar = useCallback(async () => {
    setLoading(true)
    const { data, error } = await sb
      .from('bloqueios')
      .select('*')
      .gte('data', hojeStr)
      .order('data')
      .order('hora_inicio')
    if (error) console.error('[Bloqueios]', error?.message, '| code:', error?.code)
    setBloqueios((data as Bloqueio[]) ?? [])
    setLoading(false)
  }, [sb, hojeStr])

  useEffect(() => { carregar() }, [carregar])

  async function adicionar() {
    if (!form.data || !form.hora_inicio || !form.hora_fim) return
    setSalvando(true)
    const { error } = await sb.from('bloqueios').insert({
      data: form.data,
      hora_inicio: form.hora_inicio,
      hora_fim: form.hora_fim,
      motivo: form.motivo.trim() || null,
    })
    if (error) console.error('[Bloqueios] insert:', error)
    setSalvando(false)
    setForm({ data: '', hora_inicio: '', hora_fim: '', motivo: '' })
    await carregar()
  }

  async function excluir(id: string) {
    setExcluindo(e => ({ ...e, [id]: true }))
    await sb.from('bloqueios').delete().eq('id', id)
    setExcluindo(e => { const n = { ...e }; delete n[id]; return n })
    await carregar()
  }

  function formatarBloqueioData(str: string) {
    const [a, m, d] = str.split('-').map(Number)
    const dt = new Date(a, m - 1, d)
    return dt.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })
  }

  const podeAdicionar = !salvando && !!form.data && !!form.hora_inicio && !!form.hora_fim

  return (
    <div>
      <SecaoTitulo titulo="Bloqueios" />

      <div className="bg-white rounded-2xl border border-stone-100 p-5 shadow-sm mb-6">
        <p className="text-[10px] text-stone-400 tracking-[0.2em] uppercase mb-4" style={sans}>
          Adicionar bloqueio de horário
        </p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="col-span-2 sm:col-span-1">
            <label className="block text-[10px] text-stone-400 mb-1 tracking-[0.15em] uppercase" style={sans}>Data</label>
            <input type="date" value={form.data} min={hojeStr}
              onChange={e => setForm(f => ({ ...f, data: e.target.value }))}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-[#2D1B33] outline-none focus:border-[#D4548A] transition-colors" style={sans} />
          </div>
          <div>
            <label className="block text-[10px] text-stone-400 mb-1 tracking-[0.15em] uppercase" style={sans}>Início</label>
            <input type="time" value={form.hora_inicio}
              onChange={e => setForm(f => ({ ...f, hora_inicio: e.target.value }))}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-[#2D1B33] outline-none focus:border-[#D4548A] transition-colors" style={sans} />
          </div>
          <div>
            <label className="block text-[10px] text-stone-400 mb-1 tracking-[0.15em] uppercase" style={sans}>Fim</label>
            <input type="time" value={form.hora_fim}
              onChange={e => setForm(f => ({ ...f, hora_fim: e.target.value }))}
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-[#2D1B33] outline-none focus:border-[#D4548A] transition-colors" style={sans} />
          </div>
          <div className="col-span-2 sm:col-span-4">
            <label className="block text-[10px] text-stone-400 mb-1 tracking-[0.15em] uppercase" style={sans}>Motivo (opcional)</label>
            <input value={form.motivo}
              onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
              placeholder="Ex: Feriado, viagem..."
              className="w-full border border-stone-200 rounded-xl px-3 py-2 text-sm text-[#2D1B33] outline-none focus:border-[#D4548A] transition-colors placeholder:text-stone-300" style={sans} />
          </div>
        </div>
        <button onClick={adicionar} disabled={!podeAdicionar}
          className="mt-4 w-full bg-[#2D1B33] text-[#FFF8F0] py-2.5 rounded-xl text-[10px] tracking-[0.3em] uppercase font-medium disabled:opacity-40 hover:bg-[#4a2d5a] transition-colors" style={sans}>
          {salvando ? 'Adicionando...' : 'Adicionar bloqueio'}
        </button>
      </div>

      <div className="flex items-center gap-4 mb-4">
        <p className="text-sm font-medium text-stone-500 shrink-0" style={sans}>Bloqueios futuros</p>
        <div className="h-px flex-1 bg-stone-100" />
      </div>

      {loading ? <Spinner /> : bloqueios.length === 0 ? (
        <p className="text-stone-400 text-sm py-4" style={sans}>Nenhum bloqueio futuro cadastrado.</p>
      ) : (
        <div className="grid gap-2">
          {bloqueios.map(b => (
            <div key={b.id} className="bg-white rounded-2xl border border-stone-100 px-5 py-3.5 flex items-center gap-4 shadow-sm">
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-[#2D1B33] text-sm capitalize" style={sans}>
                  {formatarBloqueioData(b.data)}
                </p>
                <p className="text-stone-400 text-xs mt-0.5" style={sans}>
                  {b.hora_inicio.slice(0, 5)} – {b.hora_fim.slice(0, 5)}
                  {b.motivo ? ` · ${b.motivo}` : ''}
                </p>
              </div>
              <button onClick={() => excluir(b.id)} disabled={excluindo[b.id]}
                className="text-[10px] tracking-[0.15em] uppercase text-red-400 border border-red-100 px-3 py-1.5 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors shrink-0" style={sans}>
                {excluindo[b.id] ? '...' : 'Excluir'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── página principal ─────────────────────────────────────────────────────────

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

  const [abaAtiva, setAbaAtiva]         = useState<Tab>('agenda')
  const [hoje, setHoje]                 = useState<Agendamento[]>([])
  const [proximos, setProximos]         = useState<Agendamento[]>([])
  const [historico, setHistorico]       = useState<Agendamento[]>([])
  const [loading, setLoading]           = useState(true)
  const [loadingHist, setLoadingHist]   = useState(false)
  const [mostrarHistorico, setMostrarHistorico] = useState(false)
  const historicoCarregado              = useRef(false)

  const hojeStr = new Date().toISOString().split('T')[0]

  useEffect(() => {
    sb.auth.getSession().then(({ data, error }) => {
      if (error)             console.error('[Admin] erro sessão:', error.message)
      else if (data.session) console.log('[Admin] sessão ativa —', data.session.user.email)
      else                   console.warn('[Admin] sem sessão autenticada')
    })
  }, [sb])

  const fetchAgenda = useCallback(async () => {
    setLoading(true)
    const select = 'id, data, horario, status, observacoes, clientes(nome, whatsapp), servicos(nome)'
    const [resHoje, resProximos] = await Promise.all([
      sb.from('agendamentos').select(select)
        .eq('data', hojeStr)
        .in('status', ['pendente', 'confirmado'])
        .order('horario'),
      sb.from('agendamentos').select(select)
        .gt('data', hojeStr)
        .in('status', ['pendente', 'confirmado'])
        .order('data').order('horario').limit(15),
    ])
    if (resHoje.error)     console.error('[Admin] query hoje:', resHoje.error)
    if (resProximos.error) console.error('[Admin] query proximos:', resProximos.error)
    setHoje((resHoje.data as unknown as Agendamento[]) ?? [])
    setProximos((resProximos.data as unknown as Agendamento[]) ?? [])
    setLoading(false)
  }, [sb, hojeStr])

  useEffect(() => { fetchAgenda() }, [fetchAgenda])

  async function fetchHistorico() {
    setLoadingHist(true)
    const trintaDiasAtras = new Date()
    trintaDiasAtras.setDate(trintaDiasAtras.getDate() - 30)
    const inicioStr = trintaDiasAtras.toISOString().split('T')[0]
    const select = 'id, data, horario, status, observacoes, clientes(nome, whatsapp), servicos(nome)'
    const { data, error } = await sb
      .from('agendamentos')
      .select(select)
      .in('status', ['concluido', 'cancelado'])
      .gte('data', inicioStr)
      .order('data', { ascending: false })
      .order('horario', { ascending: false })
      .limit(50)
    if (error) console.error('[Admin] query historico:', error)
    setHistorico((data as unknown as Agendamento[]) ?? [])
    historicoCarregado.current = true
    setLoadingHist(false)
  }

  function handleToggleHistorico() {
    const abrindo = !mostrarHistorico
    setMostrarHistorico(abrindo)
    if (abrindo && !historicoCarregado.current) fetchHistorico()
  }

  async function handleAction(id: string, status: StatusAgendamento) {
    const { error } = await sb.from('agendamentos').update({ status }).eq('id', id)
    if (error) console.error('[Admin] update status:', error)
    await fetchAgenda()
    if (historicoCarregado.current) fetchHistorico()
  }

  async function handleLogout() {
    await sb.auth.signOut()
    router.push('/admin/login')
  }

  const totalPendente = hoje.filter(a => a.status === 'pendente').length +
                        proximos.filter(a => a.status === 'pendente').length

  return (
    <div className="min-h-screen" style={{ background: 'linear-gradient(135deg, #F5E6F0 0%, #EDE0F5 100%)' }}>
      {/* header */}
      <header style={{ backgroundColor: '#2D1B33' }} className="px-6 pt-5">
        <div className="max-w-3xl mx-auto flex items-center justify-between pb-4">
          <div>
            <p className="text-[#D4548A] text-[10px] tracking-[0.4em] uppercase mb-1" style={sans}>Painel</p>
            <h1 className="text-2xl font-light text-[#FFF8F0]" style={serif}>Luana Miniuk Studio</h1>
          </div>
          <button onClick={handleLogout}
            className="text-[10px] tracking-[0.25em] uppercase text-stone-400 hover:text-[#D4548A] transition-colors border border-stone-700 px-4 py-2 rounded-xl" style={sans}>
            Sair
          </button>
        </div>

        {/* abas */}
        <div className="max-w-3xl mx-auto flex gap-0.5 overflow-x-auto">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setAbaAtiva(t.id)}
              className={`px-4 py-2.5 text-[10px] tracking-[0.2em] uppercase font-medium rounded-t-xl transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                abaAtiva === t.id ? 'bg-[#FFF8F0] text-[#2D1B33]' : 'text-stone-400 hover:text-[#D4548A]'
              }`} style={sans}>
              {t.label}
              {t.id === 'agenda' && !loading && totalPendente > 0 && (
                <span className="bg-[#D4548A] text-white text-[8px] rounded-full min-w-[15px] h-[15px] px-0.5 inline-flex items-center justify-center font-bold leading-none">
                  {totalPendente}
                </span>
              )}
            </button>
          ))}
        </div>
      </header>

      {/* conteúdo */}
      <main className="max-w-3xl mx-auto px-4 py-8">
        {abaAtiva === 'agenda' && (
          <div className="space-y-10">
            <SecaoAgenda titulo="Hoje" items={hoje} loading={loading} showDate={false}
              vazio="Nenhum agendamento ativo hoje." onAction={handleAction} />
            <SecaoAgenda titulo="Próximos agendamentos" items={proximos} loading={loading} showDate={true}
              vazio="Nenhum agendamento futuro confirmado." onAction={handleAction} />

            {/* histórico */}
            <section>
              <button
                onClick={handleToggleHistorico}
                className="flex items-center gap-3 w-full mb-5 group"
              >
                <h2 className="text-2xl font-light italic text-stone-400 shrink-0 group-hover:text-[#2D1B33] transition-colors" style={serif}>
                  Histórico
                </h2>
                <div className="h-px flex-1 bg-stone-200" />
                <span className="text-[10px] tracking-[0.2em] uppercase text-stone-400 group-hover:text-[#D4548A] transition-colors shrink-0" style={sans}>
                  {mostrarHistorico ? 'Ocultar ▲' : 'Ver histórico ▼'}
                </span>
              </button>

              {mostrarHistorico && (
                loadingHist ? <Spinner /> : historico.length === 0 ? (
                  <p className="text-stone-400 text-sm py-4" style={sans}>
                    Nenhum atendimento concluído ou cancelado nos últimos 30 dias.
                  </p>
                ) : (
                  <div className="grid gap-3">
                    {historico.map(item => (
                      <CardAgendamento key={item.id} item={item} showDate={true} onAction={handleAction} muted={true} />
                    ))}
                  </div>
                )
              )}
            </section>
          </div>
        )}
        {abaAtiva === 'servicos'   && <AbaServicos   sb={sb} />}
        {abaAtiva === 'clientes'   && <AbaClientes   sb={sb} />}
        {abaAtiva === 'financeiro' && <AbaFinanceiro sb={sb} />}
        {abaAtiva === 'bloqueios'  && <AbaBloqueios  sb={sb} />}
      </main>
    </div>
  )
}
