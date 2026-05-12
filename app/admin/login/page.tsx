'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

const serif = { fontFamily: 'var(--font-cormorant), Georgia, serif' } as const
const sans = { fontFamily: 'var(--font-dm-sans), sans-serif' } as const

export default function AdminLogin() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const supabase = createBrowserClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (authError) {
      setError('E-mail ou senha inválidos.')
      setLoading(false)
      return
    }

    router.push('/admin')
    router.refresh()
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4"
      style={{ backgroundColor: '#1A1612' }}
    >
      <div className="mb-10 text-center">
        <p
          className="text-[#C9A96E] text-[10px] tracking-[0.4em] uppercase mb-3"
          style={sans}
        >
          Área Restrita
        </p>
        <h1
          className="text-4xl font-light text-[#F9F5EF] tracking-wide"
          style={serif}
        >
          Luana Miniuk Studio
        </h1>
        <div className="flex items-center justify-center gap-3 mt-4">
          <div className="h-px w-12 bg-[#C9A96E] opacity-40" />
          <div className="w-1 h-1 rounded-full bg-[#C9A96E] opacity-60" />
          <div className="h-px w-12 bg-[#C9A96E] opacity-40" />
        </div>
      </div>

      <div className="bg-white rounded-2xl p-8 w-full max-w-sm shadow-2xl">
        <h2
          className="text-2xl font-light italic text-[#1A1612] mb-6"
          style={serif}
        >
          Acesso ao painel
        </h2>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label
              className="block text-[10px] text-stone-400 mb-1.5 tracking-[0.2em] uppercase"
              style={sans}
            >
              E-mail
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-[#1A1612] text-sm outline-none focus:border-[#C9A96E] transition-colors placeholder:text-stone-300"
              style={sans}
              placeholder="seu@email.com"
            />
          </div>

          <div>
            <label
              className="block text-[10px] text-stone-400 mb-1.5 tracking-[0.2em] uppercase"
              style={sans}
            >
              Senha
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="w-full border border-stone-200 rounded-xl px-4 py-3 text-[#1A1612] text-sm outline-none focus:border-[#C9A96E] transition-colors placeholder:text-stone-300"
              style={sans}
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-red-400 text-xs text-center py-1" style={sans}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#1A1612] text-[#F9F5EF] py-3.5 rounded-xl text-[10px] tracking-[0.3em] uppercase font-medium disabled:opacity-50 transition-all hover:bg-[#2c231a] mt-2"
            style={sans}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
