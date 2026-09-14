import { useState } from 'react'
import { AppIcon } from './AppIcon'
import { supabase } from '../lib/supabase'
import { messageFromError } from '../lib/format'

export function LoginScreen() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showPassword, setShowPassword] = useState(false)

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
        <div className="brand-mark" aria-hidden="true"><AppIcon name="home" size={32} /></div>
        <p className="eyebrow">家族の毎日</p>
        <h1 id="login-title">ふたりの暮らし</h1>
        <p className="login-copy">
          お金も、買い物も、ふたりの楽しみも。<br />毎日のことをひとつの場所に。
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
            <span id="password-label">パスワード</span>
            <div className="password-field"><input
              aria-labelledby="password-label"
              type={showPassword ? 'text' : 'password'}
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="パスワードを入力"
            /><button type="button" aria-pressed={showPassword} onClick={() => setShowPassword((value) => !value)}>{showPassword ? '隠す' : '表示'}</button></div>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>
            {busy ? '確認しています…' : 'ログイン'}
          </button>
        </form>
        <p className="login-note">登録済みの家族アカウントだけが利用できます</p>
      </section>
    </main>
  )
}
