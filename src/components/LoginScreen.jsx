import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { messageFromError } from '../lib/format'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (!email.trim() || !password) {
      setError('メールアドレスとパスワードを入力してください。')
      return
    }

    setBusy(true)
    setError('')
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })
    if (signInError) setError(messageFromError(signInError))
    setBusy(false)
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="login-title">
        <div className="brand-mark" aria-hidden="true">¥</div>
        <p className="eyebrow">OUR LITTLE WALLET</p>
        <h1 id="login-title">ふたりのお財布</h1>
        <p className="login-copy">
          貸し借りも、買い出しも。<br />ふたりの毎日をひとつの場所に。
        </p>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            <span>メールアドレス</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>
          <label>
            <span>パスワード</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="8文字以上"
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '確認しています…' : 'ログイン'}
          </button>
        </form>
        <p className="login-note">登録済みの夫婦アカウントだけが利用できます</p>
      </section>
    </main>
  )
}
