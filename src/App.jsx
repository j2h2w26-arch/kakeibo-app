import { useCallback, useEffect, useState } from 'react'
import { HomeView } from './components/HomeView'
import { LoanView } from './components/LoanView'
import { LoginScreen } from './components/LoginScreen'
import { LivingHubView } from './components/LivingHubView'
import { WishHubView } from './components/WishHubView'
import { PointActionsView } from './components/PointActionsView'
import { SettingsView } from './components/SettingsView'
import { useHouseholdData } from './hooks/useHouseholdData'
import { useDailyReminder } from './hooks/useDailyReminder'
import {
  cancelRepayment,
  completePointActivity,
  createPointActivity,
  createInventoryItem,
  createLoan,
  createShoppingItem,
  createShoppingItems,
  createWish,
  createExpense,
  createReceiptUrl,
  createWishComment,
  createLifeTask,
  createLifeGoal,
  updateLifeGoal,
  createLifeGoalRoute,
  updateLifeGoalRoute,
  createLifeGoalMilestone,
  updateLifeGoalMilestone,
  linkLifeTaskToGoal,
  unlinkLifeTaskFromGoal,
  createChore,
  completeChore,
  recordRepayment,
  removeLoan,
  removeInventoryItem,
  removePointActivity,
  removeShoppingItem,
  removeWish,
  removeExpense,
  removeWishComment,
  removeLifeTask,
  saveNotificationPreferences,
  updateShoppingItem,
  updateInventoryItem,
  updatePointActivity,
  updateWish,
  updateLifeTask,
  updateChore,
  undoPointActivityCompletion,
  setPointCampaignDecision,
  setPointServicePreference,
  syncPointCampaigns,
} from './lib/data'
import { messageFromError, todayInTokyo } from './lib/format'
import { supabase } from './lib/supabase'
import { deriveSyncStatus } from './lib/syncStatus'
import './App.css'
import { AppIcon } from './components/AppIcon'

const MEMBER_CACHE_KEY = 'futari-wallet-member-v1'

const NAV_ITEMS = [
  { id: 'home', icon: '⌂', label: '選ぶ' },
  { id: 'money', icon: '¥', label: 'お金' },
  { id: 'shopping', icon: '✓', label: '暮らし' },
  { id: 'wishes', icon: '♡', label: '未来' },
  { id: 'points', icon: '★', label: 'ポイント' },
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
      <div className="brand-mark" aria-hidden="true"><AppIcon name="home" size={28} /></div>
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

  const {
    snapshot,
    loading,
    syncState,
    realtimeState,
    lastSyncedAt,
    error,
    refresh,
    retrySync,
    clearLocalData,
  } = useHouseholdData(Boolean(member))
  const syncStatus = deriveSyncStatus({ online, syncState, realtimeState })

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

  const runAction = useCallback(async (action, successMessage) => {
    if (!navigator.onLine) {
      setToast({ type: 'error', message: 'オフライン中は編集できません。' })
      return false
    }
    setBusy(true)
    try {
      const actionResult = await action()
      const refreshResult = await refresh({ quiet: true })
      const warnings = []
      if (actionResult?.warning) warnings.push(actionResult.warning)
      if (!refreshResult?.ok) warnings.push('保存は完了しましたが、最新表示の取得に失敗しました。「同期エラー」から再試行できます。')
      setToast({
        type: warnings.length > 0 ? 'warning' : 'success',
        message: warnings.length > 0 ? warnings.join(' ') : successMessage,
      })
      return true
    } catch (actionError) {
      setToast({ type: 'error', message: messageFromError(actionError) })
      return false
    } finally {
      setBusy(false)
    }
  }, [refresh])

  const showReminder = useCallback((message) => {
    setToast({ type: 'success', message })
  }, [])

  useDailyReminder({
    memberId: member?.user_id,
    preferences: snapshot.notificationPreferences,
    snapshot,
    onReminder: showReminder,
  })

  async function handleOpenReceipt(path) {
    const receiptWindow = window.open('about:blank', '_blank')
    if (receiptWindow) receiptWindow.opener = null
    try {
      const url = await createReceiptUrl(path)
      if (receiptWindow) receiptWindow.location.replace(url)
      else window.location.assign(url)
    } catch (receiptError) {
      receiptWindow?.close()
      setToast({ type: 'error', message: messageFromError(receiptError) })
    }
  }

  async function handleSignOut() {
    const { error: signOutError } = await supabase.auth.signOut()
    if (signOutError) {
      setToast({ type: 'error', message: messageFromError(signOutError) })
      return
    }
    clearLocalData()
    localStorage.removeItem(MEMBER_CACHE_KEY)
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
      <HomeView member={member} onNavigate={setTab} />
    )
  } else if (tab === 'money') {
    currentView = (
      <LoanView
        loans={snapshot.loans}
        repayments={snapshot.repayments}
        expenses={snapshot.expenses}
        online={online}
        busy={busy}
        onCreate={(input) => runAction(() => createLoan(input), '貸し借りを登録しました')}
        onDelete={(id) => runAction(() => removeLoan(id), '貸し借りを削除しました')}
        onRepay={(input) => runAction(() => recordRepayment(input), '返済を記録しました')}
        onCancelRepayment={(id) => runAction(() => cancelRepayment(id), '返済を取り消しました')}
        onCreateExpense={(input, receipt) => runAction(
          () => createExpense(input, receipt, member.user_id),
          '家計簿に保存しました',
        )}
        onDeleteExpense={(expense) => runAction(() => removeExpense(expense), '支出を削除しました')}
        onOpenReceipt={handleOpenReceipt}
      />
    )
  } else if (tab === 'shopping') {
    currentView = (
      <LivingHubView
        shoppingProps={{
          items: snapshot.items,
          inventoryItems: snapshot.inventoryItems,
          inventorySchemaReady: snapshot.inventorySchemaReady,
          memberId: member.user_id,
          online,
          busy,
          onCreateMany: (inputs) => runAction(
            () => createShoppingItems(inputs),
            `${inputs.length}件を買い出しに追加しました`,
          ),
          onUpdate: (id, input) => runAction(() => updateShoppingItem(id, input), '買い出しを更新しました'),
          onDelete: (id) => runAction(() => removeShoppingItem(id), '買い出しから削除しました'),
          onCreateInventory: (input) => runAction(
            () => createInventoryItem({ ...input, updated_by: member.user_id }),
            '在庫に追加しました',
          ),
          onUpdateInventory: (id, input) => runAction(
            () => updateInventoryItem(id, {
              ...input,
              updated_by: member.user_id,
              updated_at: new Date().toISOString(),
            }),
            '在庫を更新しました',
          ),
          onDeleteInventory: (id) => runAction(() => removeInventoryItem(id), '在庫から削除しました'),
          onAddInventoryToShopping: (item) => runAction(
            () => createShoppingItem({
              name: item.name,
              category: item.category,
              is_purchased: false,
              purchased_at: null,
            }),
            '買うものに追加しました',
          ),
          onReplenishInventory: (item) => runAction(
            () => updateInventoryItem(item.id, {
              status: 'enough',
              quantity: item.quantity === null ? null : Number(item.quantity) + 1,
              updated_by: member.user_id,
              updated_at: new Date().toISOString(),
            }),
            '在庫を補充しました',
          ),
        }}
        choreProps={{
          appliances: snapshot.appliances,
          chores: snapshot.chores,
          completions: snapshot.choreCompletions,
          schemaReady: snapshot.choresSchemaReady,
          memberId: member.user_id,
          memberName: member.display_name,
          today: todayInTokyo(),
          online,
          busy,
          onCreate: (input) => runAction(
            () => createChore({ ...input, created_by: member.user_id }),
            '家事を追加しました',
          ),
          onUpdate: (id, input) => runAction(() => updateChore(id, input), '家事を更新しました'),
          onComplete: (id, completedOn) => runAction(
            () => completeChore(id, completedOn),
            '完了しました。次回期限も更新しました',
          ),
        }}
      />
    )
  } else if (tab === 'wishes') {
    currentView = (
      <WishHubView
        wishes={snapshot.wishes}
        lifeTasks={snapshot.lifeTasks}
        lifeGoals={snapshot.lifeGoals}
        wishProps={{
          comments: snapshot.wishComments,
          memberId: member.user_id,
          online,
          busy,
          onCreate: (input) => runAction(() => createWish(input), 'Wishを追加しました'),
          onUpdate: (id, input) => runAction(() => updateWish(id, input), 'Wishを更新しました'),
          onDelete: (id) => runAction(() => removeWish(id), 'Wishを削除しました'),
          onAddComment: (wishId, body) => runAction(
            () => createWishComment({ wish_id: wishId, body, created_by: member.user_id }),
            'コメントを追加しました',
          ),
          onDeleteComment: (id) => runAction(() => removeWishComment(id), 'コメントを削除しました'),
          onAddToShopping: (wish) => runAction(
            () => createShoppingItem({
              name: wish.title,
              category: 'その他',
              is_purchased: false,
              purchased_at: null,
            }),
            '買い物リストに追加しました',
          ),
        }}
        lifeTaskProps={{
          schemaReady: snapshot.lifeTasksSchemaReady,
          online,
          busy,
          onCreate: (input) => runAction(
            () => createLifeTask({ ...input, created_by: member.user_id }),
            '人生ToDoを追加しました',
          ),
          onUpdate: (id, input) => runAction(() => updateLifeTask(id, input), '人生ToDoを更新しました'),
          onDelete: (id) => runAction(() => removeLifeTask(id), '人生ToDoを削除しました'),
        }}
        lifePlanningProps={{
          routes: snapshot.lifeGoalRoutes,
          milestones: snapshot.lifeGoalMilestones,
          taskLinks: snapshot.lifeGoalTaskLinks,
          schemaReady: snapshot.lifePlanningSchemaReady,
          online,
          busy,
          onCreateGoal: (input) => runAction(
            () => createLifeGoal({ ...input, created_by: member.user_id }),
            '人生の目標を追加しました',
          ),
          onUpdateGoal: (id, input) => runAction(() => updateLifeGoal(id, input), '目標を更新しました'),
          onCreateRoute: (input) => runAction(
            () => createLifeGoalRoute({ ...input, created_by: member.user_id }),
            '実現ルートを追加しました',
          ),
          onUpdateRoute: (id, input) => runAction(() => updateLifeGoalRoute(id, input), 'ルートを更新しました'),
          onCreateMilestone: (input) => runAction(
            () => createLifeGoalMilestone({ ...input, created_by: member.user_id }),
            'マイルストーンを追加しました',
          ),
          onUpdateMilestone: (id, input) => runAction(
            () => updateLifeGoalMilestone(id, input),
            'マイルストーンを更新しました',
          ),
          onLinkTask: (goalId, taskId) => runAction(
            () => linkLifeTaskToGoal({ goal_id: goalId, task_id: taskId, created_by: member.user_id }),
            'ToDoを目標に紐づけました',
          ),
          onUnlinkTask: (goalId, taskId) => runAction(
            () => unlinkLifeTaskFromGoal(goalId, taskId),
            'ToDoの紐づけを外しました',
          ),
        }}
      />
    )
  } else if (tab === 'points') {
    currentView = (
      <PointActionsView
        activities={snapshot.pointActivities}
        completions={snapshot.pointCompletions}
        sources={snapshot.pointSources}
        campaigns={snapshot.pointCampaigns}
        campaignSteps={snapshot.pointCampaignSteps}
        campaignStates={snapshot.pointCampaignStates}
        servicePreferences={snapshot.pointServicePreferences}
        syncRuns={snapshot.pointSyncRuns}
        campaignSchemaReady={snapshot.pointCampaignSchemaReady}
        member={member}
        online={online}
        busy={busy}
        onCreate={(input) => runAction(() => createPointActivity(input), 'ポイ活項目を追加しました')}
        onUpdate={(id, input) => runAction(() => updatePointActivity(id, input), 'ポイ活項目を更新しました')}
        onDelete={(id) => runAction(() => removePointActivity(id), 'ポイ活項目を削除しました')}
        onComplete={(input) => runAction(() => completePointActivity(input), '完了にしました')}
        onUndo={(id) => runAction(() => undoPointActivityCompletion(id), '完了を取り消しました')}
        onCampaignDecision={(id, decision) => runAction(
          () => setPointCampaignDecision(id, decision),
          decision === 'joined' ? 'Todoに追加しました' : '表示設定を保存しました',
        )}
        onServicePreference={(serviceKey, isEnabled) => runAction(
          () => setPointServicePreference(member.user_id, serviceKey, isEnabled),
          '表示サービスを更新しました',
        )}
        onSync={() => runAction(() => syncPointCampaigns(), '公式情報を更新しました')}
      />
    )
  } else if (tab === 'settings') {
    currentView = (
      <SettingsView
        preferences={snapshot.notificationPreferences}
        online={online}
        busy={busy}
        onBack={() => setTab('home')}
        onSignOut={handleSignOut}
        onSave={(input) => runAction(
          () => saveNotificationPreferences({ ...input, user_id: member.user_id }),
          '朝夕のお知らせ設定を保存しました',
        )}
      />
    )
  } else {
    currentView = null
  }

  return (
    <div className={`app-shell theme-${tab}`}>
      <header className="app-header">
        <div>
          <p className="eyebrow">ふたりの暮らし</p>
          <h1>ふたりの暮らし</h1>
        </div>
        <div className="header-actions">
          <button
            className={`sync-indicator ${syncStatus.kind}`}
            type="button"
            title={lastSyncedAt ? `最終同期: ${new Date(lastSyncedAt).toLocaleString('ja-JP')}` : '同期状態'}
            aria-label={syncStatus.retryable ? '同期エラー。押すと再試行します' : `同期状態: ${syncStatus.label}`}
            onClick={retrySync}
            disabled={!syncStatus.retryable || syncState === 'syncing'}
          >
            <i />
            {syncStatus.label}
          </button>
          <button className="profile-button" type="button" onClick={() => setTab('settings')}>
            <span className="profile-avatar" aria-hidden="true">{member.display_name.slice(0, 1)}</span>
            <span>設定</span>
          </button>
        </div>
      </header>

      {!online && (
        <div className="offline-banner" role="status">
          オフラインです。直近のデータを表示しています。
        </div>
      )}

      {online && syncStatus.kind === 'error' && (
        <div className="sync-error-banner" role="alert" title={error ? messageFromError(error) : undefined}>
          <span>最新データを取得できませんでした。端末内のデータを表示しています。</span>
          <button type="button" onClick={retrySync} disabled={syncState === 'syncing'}>再試行</button>
        </div>
      )}

      <main className="app-content" key={tab}>{currentView}</main>

      {tab !== 'home' && tab !== 'settings' && <nav className="bottom-nav" aria-label="機能を切り替える">
        {NAV_ITEMS.map((item) => (
          <button
            className={tab === item.id ? 'active' : ''}
            type="button"
            key={item.id}
            onClick={() => setTab(item.id)}
            aria-current={tab === item.id ? 'page' : undefined}
          >
            <span aria-hidden="true"><AppIcon name={item.id} /></span>
            <b>{item.label}</b>
          </button>
        ))}
      </nav>}

      {toast && <div className={`toast ${toast.type}`} role={toast.type === 'error' ? 'alert' : 'status'}><span className="toast-symbol" aria-hidden="true">{toast.type === 'success' ? <AppIcon name="check" size={20} /> : '!'}</span><span>{toast.message}</span><button type="button" aria-label="通知を閉じる" onClick={() => setToast(null)}>×</button></div>}
    </div>
  )
}

export default App
