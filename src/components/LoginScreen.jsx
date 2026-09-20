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
  const [showRecovery, setShowRecovery] = useState(false)
  const [recoverySent, setRecoverySent] = useState(false)

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

  async function sendRecovery() {
    if (!email.trim()) {
      setError('再設定メールを受け取るメールアドレスを入力してください。')
      return
    }
    setBusy(true)
    setError('')
    const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      // Password reset must always return to the deployed app. Using the current
      // origin here would put localhost URLs into emails sent from local development.
      redirectTo: 'https://kakeibo-app-pi-umber.vercel.app',
    })
    if (recoveryError) {
      setError(messageFromError(recoveryError))
    } else {
      setRecoverySent(true)
    }
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
        {showRecovery ? (
          <section className="login-recovery" aria-live="polite">
            <p>入力したメールアドレスへ、パスワード再設定用のリンクを送ります。</p>
            <button className="secondary-button" type="button" onClick={sendRecovery} disabled={busy || recoverySent}>
              {recoverySent ? 'メールを送信しました' : busy ? '送信しています…' : '再設定メールを送る'}
            </button>
            {recoverySent && <p className="login-note">メール内のリンクをこの端末で開き、新しいパスワードを設定してください。</p>}
          </section>
        ) : <button className="text-button" type="button" onClick={() => { setShowRecovery(true); setRecoverySent(false); setError('') }}>パスワードを忘れた場合</button>}
        <p className="login-note">登録済みの家族アカウントだけが利用できます</p>
      </section>
    </main>
  )
}

export function PasswordRecoveryScreen({ onComplete, onSignOut }) {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()
    if (password.length < 8) {
      setError('パスワードは8文字以上にしてください。')
      return
    }
    if (password !== confirmation) {
      setError('確認用パスワードが一致しません。')
      return
    }
    setBusy(true)
    setError('')
    const { error: updateError } = await supabase.auth.updateUser({ password })
    if (updateError) {
      setError(messageFromError(updateError))
    } else {
      onComplete()
    }
    setBusy(false)
  }

  return (
    <main className="login-screen">
      <section className="login-card" aria-labelledby="password-recovery-title">
        <div className="brand-mark" aria-hidden="true"><AppIcon name="home" size={32} /></div>
        <p className="eyebrow">PASSWORD RESET</p>
        <h1 id="password-recovery-title">新しいパスワードを設定</h1>
        <p className="login-copy">この端末で使う新しいパスワードを入力してください。</p>
        <form className="login-form" onSubmit={handleSubmit}>
          <label><span>新しいパスワード</span><input type="password" autoComplete="new-password" minLength="8" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label><span>新しいパスワード（確認）</span><input type="password" autoComplete="new-password" minLength="8" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={busy}>{busy ? '設定しています…' : '新しいパスワードを保存'}</button>
        </form>
        <button className="text-button" type="button" onClick={onSignOut}>別のアカウントでログインする</button>
      </section>
    </main>
  )
}
