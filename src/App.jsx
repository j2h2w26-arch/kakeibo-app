import { useCallback, useEffect, useState } from 'react'
import { FeaturePreview } from './components/FeaturePreview'
import { HomeView } from './components/HomeView'
import { LoanView } from './components/LoanView'
import { LoginScreen } from './components/LoginScreen'
import { ShoppingView } from './components/ShoppingView'
import { WishView } from './components/WishView'
import { useHouseholdData } from './hooks/useHouseholdData'
import {
  cancelRepayment,
  createLoan,
  createShoppingItem,
  createWish,
  recordRepayment,
  removeLoan,
  removeShoppingItem,
  removeWish,
  updateShoppingItem,
  updateWish,
} from './lib/data'
import { messageFromError } from './lib/format'
import { supabase } from './lib/supabase'
import './App.css'

const MEMBER_CACHE_KEY = 'futari-wallet-member-v1'

const NAV_ITEMS = [
  { id: 'home', icon: '⌂', label: 'ホーム' },
  { id: 'money', icon: '¥', label: 'お金' },
  { id: 'shopping', icon: '✓', label: '買い物' },
  { id: 'wishes', icon: '♡', label: 'Wish' },
  { id: 'points', icon: '★', label: 'ポイ活' },
]

function readCachedMember(userId) {
  try {
    const cached = JSON.parse(localStorage.getItem(MEMBER_CACHE_KEY))
    return cached?.user_id === userId ? cached : null
  } catch {
    return null
  }
}

function LoadingScreen({ message = '読み込んでいます…' }) {
  return (
    <main className="loading-screen">
      <div className="brand-mark" aria-hidden="true">¥</div>
      <div className="loading-dots" aria-hidden="true"><span /><span /><span /></div>
      <p>{message}</p>
    </main>
  )
}

function App() {
  const [session, setSession] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [member, setMember] = useState(null)
  const [memberLoading, setMemberLoading] = useState(false)
  const [accessError, setAccessError] = useState('')
  const [tab, setTab] = useState('home')
  const [online, setOnline] = useState(() => navigator.onLine)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  const { snapshot, loading, syncState, error, refresh } = useHouseholdData(Boolean(member))

  useEffect(() => {
    let mounted = true
    supabase.auth.getSession().then(({ data }) => {
      if (mounted) {
        setSession(data.session)
        setAuthLoading(false)
      }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession)
      setAuthLoading(false)
      if (!nextSession) setMember(null)
    })
    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!session) return undefined
    let mounted = true
    setMemberLoading(true)
    setAccessError('')
    supabase
      .from('app_members')
      .select('user_id, display_name')
      .eq('user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error: memberError }) => {
        if (!mounted) return
        if (memberError) {
          const cachedMember = readCachedMember(session.user.id)
          if (!navigator.onLine && cachedMember) {
            setMember(cachedMember)
          } else {
            setAccessError(messageFromError(memberError))
          }
        } else if (!data) {
          setAccessError('このアカウントは夫婦メンバーとして登録されていません。')
        } else {
          setMember(data)
          localStorage.setItem(MEMBER_CACHE_KEY, JSON.stringify(data))
        }
        setMemberLoading(false)
      })
    return () => { mounted = false }
  }, [session])

  useEffect(() => {
    const updateOnline = () => setOnline(navigator.onLine)
    window.addEventListener('online', updateOnline)
    window.addEventListener('offline', updateOnline)
    return () => {
      window.removeEventListener('online', updateOnline)
      window.removeEventListener('offline', updateOnline)
    }
  }, [])

  useEffect(() => {
    if (!toast) return undefined
    const timer = window.setTimeout(() => setToast(null), 2800)
    return () => window.clearTimeout(timer)
  }, [toast])

  useEffect(() => {
    if (error) setToast({ type: 'error', message: messageFromError(error) })
  }, [error])

  const runAction = useCallback(async (action, successMessage) => {
    if (!navigator.onLine) {
      setToast({ type: 'error', message: 'オフライン中は編集できません。' })
      return false
    }
    setBusy(true)
    try {
      await action()
      await refresh({ quiet: true })
      setToast({ type: 'success', message: successMessage })
      return true
    } catch (actionError) {
      setToast({ type: 'error', message: messageFromError(actionError) })
      return false
    } finally {
      setBusy(false)
    }
  }, [refresh])

  async function handleSignOut() {
    localStorage.removeItem(MEMBER_CACHE_KEY)
    await supabase.auth.signOut()
  }

  if (authLoading) return <LoadingScreen />
  if (!session) return <LoginScreen />
  if (memberLoading) return <LoadingScreen message="アカウントを確認しています…" />

  if (accessError) {
    return (
      <main className="login-screen">
        <section className="login-card access-card">
          <div className="brand-mark warning" aria-hidden="true">!</div>
          <h1>利用設定が必要です</h1>
          <p className="login-copy">{accessError}</p>
          <button className="secondary-button" type="button" onClick={handleSignOut}>ログアウト</button>
        </section>
      </main>
    )
  }

  if (!member) return <LoadingScreen />

  const showInitialLoader = loading && snapshot.loans.length === 0 && snapshot.items.length === 0

  let currentView
  if (showInitialLoader) {
    currentView = <LoadingScreen message="ふたりのデータを同期しています…" />
  } else if (tab === 'home') {
    currentView = (
      <HomeView
        member={member}
        loans={snapshot.loans}
        repayments={snapshot.repayments}
        items={snapshot.items}
        wishes={snapshot.wishes}
        onNavigate={setTab}
      />
    )
  } else if (tab === 'money') {
    currentView = (
      <LoanView
        loans={snapshot.loans}
        repayments={snapshot.repayments}
        online={online}
        busy={busy}
        onCreate={(input) => runAction(() => createLoan(input), '貸し借りを登録しました')}
        onDelete={(id) => runAction(() => removeLoan(id), '貸し借りを削除しました')}
        onRepay={(input) => runAction(() => recordRepayment(input), '返済を記録しました')}
        onCancelRepayment={(id) => runAction(() => cancelRepayment(id), '返済を取り消しました')}
      />
    )
  } else if (tab === 'shopping') {
    currentView = (
      <ShoppingView
        items={snapshot.items}
        online={online}
        busy={busy}
        onCreate={(input) => runAction(() => createShoppingItem(input), '買い出しに追加しました')}
        onUpdate={(id, input) => runAction(() => updateShoppingItem(id, input), '買い出しを更新しました')}
        onDelete={(id) => runAction(() => removeShoppingItem(id), '買い出しから削除しました')}
      />
    )
  } else if (tab === 'wishes') {
    currentView = (
      <WishView
        wishes={snapshot.wishes}
        online={online}
        busy={busy}
        onCreate={(input) => runAction(() => createWish(input), 'Wishを追加しました')}
        onUpdate={(id, input) => runAction(() => updateWish(id, input), 'Wishを更新しました')}
        onDelete={(id) => runAction(() => removeWish(id), 'Wishを削除しました')}
        onAddToShopping={(wish) => runAction(
          () => createShoppingItem({
            name: wish.title,
            category: 'その他',
            is_purchased: false,
            purchased_at: null,
          }),
          '買い物リストに追加しました',
        )}
      />
    )
  } else {
    currentView = <FeaturePreview feature={tab} onBack={() => setTab('home')} />
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">FUTARI HOME</p>
          <h1>ふたりの暮らし</h1>
        </div>
        <div className="header-actions">
          <span className={`sync-indicator ${syncState}`} title="同期状態">
            <i />
            {syncState === 'syncing' ? '同期中' : online ? '同期済み' : 'オフライン'}
          </span>
          <button className="profile-button" type="button" onClick={() => window.confirm('ログアウトしますか？') && handleSignOut()}>
            {member.display_name.slice(0, 1)}
            <span className="sr-only">ログアウト</span>
          </button>
        </div>
      </header>

      {!online && (
        <div className="offline-banner" role="status">
          オフラインです。直近のデータを表示しています。
        </div>
      )}

      <main className="app-content">{currentView}</main>

      <nav className="bottom-nav" aria-label="メインメニュー">
        {NAV_ITEMS.map((item) => (
          <button
            className={tab === item.id ? 'active' : ''}
            type="button"
            key={item.id}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
          >
            <span aria-hidden="true">{item.icon}</span>
            <b>{item.label}</b>
          </button>
        ))}
      </nav>

      {toast && <div className={`toast ${toast.type}`} role="status">{toast.message}</div>}
    </div>
  )
}

export default App
