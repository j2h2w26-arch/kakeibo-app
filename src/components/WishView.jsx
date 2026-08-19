import { useMemo, useState } from 'react'
import { formatDate, formatYen, parsePositiveYen } from '../lib/format'
import { filterWishes, wishOwnerCounts } from '../lib/wishes'

const PRIORITIES = ['いつか', 'ほしい', '最優先']
const WANTED_BY = ['夫', '妻', 'ふたり']
const WISH_TYPES = ['買いたい', '行きたい', 'やりたい']
const CONSULTATION_STATUSES = ['相談中', '決定', '見送り']
const OWNER_FILTERS = [
  ['all', '全部'],
  ['夫', '夫'],
  ['妻', '妻'],
  ['ふたり', 'ふたり'],
]

const EMPTY_WISH = () => ({
  title: '',
  wish_type: '買いたい',
  consultation_status: '相談中',
  wanted_by: 'ふたり',
  priority: 'ほしい',
  price: '',
  url: '',
  target_month: '',
  candidate_date: '',
  note: '',
})

function formFromWish(wish) {
  return {
    title: wish.title,
    wish_type: wish.wish_type || '買いたい',
    consultation_status: wish.consultation_status || '相談中',
    wanted_by: wish.wanted_by,
    priority: wish.priority,
    price: wish.price ? String(wish.price) : '',
    url: wish.url || '',
    target_month: wish.target_month?.slice(0, 7) || '',
    candidate_date: wish.candidate_date || '',
    note: wish.note || '',
  }
}

function monthLabel(value) {
  if (!value) return ''
  const [year, month] = value.split('-').map(Number)
  return `${year}年${month}月`
}

function validHttpUrl(value) {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

export function WishView({
  wishes,
  comments,
  memberId,
  online,
  busy,
  onCreate,
  onUpdate,
  onDelete,
  onAddToShopping,
  onAddComment,
  onDeleteComment,
}) {
  const [filter, setFilter] = useState('open')
  const [ownerFilter, setOwnerFilter] = useState('all')
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_WISH)
  const [error, setError] = useState('')
  const [commentDrafts, setCommentDrafts] = useState({})

  const commentsByWish = useMemo(() => comments.reduce((map, comment) => {
    if (!map[comment.wish_id]) map[comment.wish_id] = []
    map[comment.wish_id].push(comment)
    return map
  }, {}), [comments])

  const openWishes = wishes.filter((wish) => !wish.is_completed)
  const visibleWishes = filterWishes(wishes, filter, ownerFilter)
  const ownerCounts = wishOwnerCounts(wishes, filter)

  function resetForm() {
    setForm(EMPTY_WISH())
    setEditingId(null)
    setShowForm(false)
    setError('')
  }

  function startEdit(wish) {
    setForm(formFromWish(wish))
    setEditingId(wish.id)
    setShowForm(true)
    setError('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submitWish(event) {
    event.preventDefault()
    const title = form.title.trim()
    const price = form.price === '' ? null : parsePositiveYen(form.price)
    const url = form.url.trim()

    if (!title) {
      setError('Wishの名前を入力してください。')
      return
    }
    if (form.price !== '' && price === null) {
      setError('価格は1円以上の整数で入力してください。')
      return
    }
    if (!validHttpUrl(url)) {
      setError('URLは http:// または https:// から入力してください。')
      return
    }

    const input = {
      title,
      wish_type: form.wish_type,
      consultation_status: form.consultation_status,
      wanted_by: form.wanted_by,
      priority: form.priority,
      price,
      url: url || null,
      target_month: form.target_month ? `${form.target_month}-01` : null,
      candidate_date: form.candidate_date || null,
      note: form.note.trim() || null,
      updated_at: new Date().toISOString(),
    }
    const success = editingId
      ? await onUpdate(editingId, input)
      : await onCreate({ ...input, is_completed: false, completed_at: null })
    if (success) resetForm()
  }

  async function toggleWish(wish) {
    await onUpdate(wish.id, {
      is_completed: !wish.is_completed,
      completed_at: wish.is_completed ? null : new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
  }

  async function submitComment(event, wishId) {
    event.preventDefault()
    const body = (commentDrafts[wishId] || '').trim()
    if (!body) return
    const success = await onAddComment(wishId, body)
    if (success) setCommentDrafts({ ...commentDrafts, [wishId]: '' })
  }

  return (
    <section className="view wish-view" aria-labelledby="wish-title">
      <div className="view-heading wish-heading">
        <div>
          <p className="eyebrow">WISH LIST</p>
          <h2 id="wish-title">ふたりのWish</h2>
        </div>
        <button
          className="round-add-button wish-add-button"
          type="button"
          onClick={() => (showForm ? resetForm() : setShowForm(true))}
          aria-expanded={showForm}
        >
          {showForm ? '×' : '＋'}
          <span className="sr-only">Wishを追加</span>
        </button>
      </div>

      <div className="wish-summary">
        <span>叶えたいWish</span>
        <strong>{openWishes.length}<small>件</small></strong>
        <p>欲しいものも、ふたりでやりたいことも。</p>
      </div>

      {showForm && (
        <form className="panel-form wish-form" onSubmit={submitWish}>
          <div className="panel-form-heading">
            <h3>{editingId ? 'Wishを編集' : 'Wishを追加'}</h3>
            <span>♡</span>
          </div>
          <label>
            <span>Wishの名前</span>
            <input
              type="text"
              maxLength="80"
              placeholder="例：新しいコーヒーメーカー"
              value={form.title}
              onChange={(event) => setForm({ ...form, title: event.target.value })}
            />
          </label>
          <div className="form-grid wish-form-grid">
            <label>
              <span>種類</span>
              <select value={form.wish_type} onChange={(event) => setForm({ ...form, wish_type: event.target.value })}>
                {WISH_TYPES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>相談状況</span>
              <select value={form.consultation_status} onChange={(event) => setForm({ ...form, consultation_status: event.target.value })}>
                {CONSULTATION_STATUSES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <div className="form-grid wish-form-grid">
            <label>
              <span>誰のWish？</span>
              <select
                value={form.wanted_by}
                onChange={(event) => setForm({ ...form, wanted_by: event.target.value })}
              >
                {WANTED_BY.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
            <label>
              <span>優先度</span>
              <select
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: event.target.value })}
              >
                {PRIORITIES.map((value) => <option key={value}>{value}</option>)}
              </select>
            </label>
          </div>
          <label>
            <span>候補日（任意）</span>
            <input type="date" value={form.candidate_date} onChange={(event) => setForm({ ...form, candidate_date: event.target.value })} />
          </label>
          <div className="form-grid wish-form-grid">
            <label>
              <span>目安価格（任意）</span>
              <div className="money-input">
                <span>¥</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  inputMode="numeric"
                  placeholder="0"
                  value={form.price}
                  onChange={(event) => setForm({ ...form, price: event.target.value })}
                />
              </div>
            </label>
            <label>
              <span>叶えたい月（任意）</span>
              <input
                type="month"
                value={form.target_month}
                onChange={(event) => setForm({ ...form, target_month: event.target.value })}
              />
            </label>
          </div>
          <label>
            <span>商品・参考URL（任意）</span>
            <input
              type="url"
              maxLength="2000"
              placeholder="https://..."
              value={form.url}
              onChange={(event) => setForm({ ...form, url: event.target.value })}
            />
          </label>
          <label>
            <span>コメント（任意）</span>
            <textarea
              maxLength="500"
              rows="3"
              placeholder="色やサイズ、ふたりで相談したことなど"
              value={form.note}
              onChange={(event) => setForm({ ...form, note: event.target.value })}
            />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-button wish-submit" type="submit" disabled={!online || busy}>
            {editingId ? '変更を保存' : 'Wishに追加'}
          </button>
        </form>
      )}

      <div className="wish-filter-heading">
        <strong>誰のWish？</strong>
        <span>夫・妻・ふたりで切り替え</span>
      </div>
      <div className="filter-row wish-owner-filter" aria-label="Wishの所有者で絞り込み">
        {OWNER_FILTERS.map(([value, label]) => (
          <button
            className={ownerFilter === value ? 'active' : ''}
            type="button"
            key={value}
            onClick={() => setOwnerFilter(value)}
            aria-pressed={ownerFilter === value}
          >
            {label}<small>{ownerCounts[value]}</small>
          </button>
        ))}
      </div>

      <div className="filter-row wish-filter" aria-label="Wishの進捗で絞り込み">
        {[
          ['open', 'これから'],
          ['all', 'すべて'],
          ['done', '叶った'],
        ].map(([value, label]) => (
          <button
            className={filter === value ? 'active' : ''}
            type="button"
            key={value}
            onClick={() => setFilter(value)}
            aria-pressed={filter === value}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="wish-list">
        {visibleWishes.length === 0 && (
          <div className="empty-state">
            <span>♡</span>
            <strong>{filter === 'done' ? '該当する叶ったWishはありません' : '該当するWishはありません'}</strong>
            <p>{ownerFilter === 'all' ? '最初のWishを追加してみよう' : `${ownerFilter}のWishを追加・編集できます`}</p>
          </div>
        )}
        {visibleWishes.map((wish) => (
          <article className={`wish-card priority-${wish.priority} ${wish.is_completed ? 'is-complete' : ''}`} key={wish.id}>
            <div className="wish-card-topline">
              <span className="wish-person">{wish.wish_type || '買いたい'}・{wish.wanted_by}</span>
              <span className="wish-priority">{wish.consultation_status || '相談中'}・{wish.priority}</span>
            </div>
            <h3>{wish.title}</h3>
            <div className="wish-meta">
              {wish.price ? <strong>{formatYen(wish.price)}</strong> : <span>価格未定</span>}
              {wish.target_month && <span>{monthLabel(wish.target_month)}</span>}
              {wish.candidate_date && <span>候補 {formatDate(wish.candidate_date)}</span>}
            </div>
            {wish.note && <p>{wish.note}</p>}
            {wish.url && (
              <a href={wish.url} target="_blank" rel="noreferrer">参考ページを開く ↗</a>
            )}
            <div className="wish-actions">
              {!wish.is_completed && (wish.wish_type || '買いたい') === '買いたい' && (
                <button type="button" disabled={!online || busy} onClick={() => onAddToShopping(wish)}>
                  買い物に追加
                </button>
              )}
              <button type="button" disabled={!online || busy} onClick={() => toggleWish(wish)}>
                {wish.is_completed ? '未完了に戻す' : '叶った！'}
              </button>
              <button type="button" onClick={() => startEdit(wish)}>編集</button>
              <button
                className="danger-action"
                type="button"
                disabled={!online || busy}
                onClick={() => window.confirm(`${wish.title}を削除しますか？`) && onDelete(wish.id)}
              >
                削除
              </button>
            </div>
            <details className="wish-discussion">
              <summary>ふたりで相談 <b>{(commentsByWish[wish.id] || []).length}件</b></summary>
              <div className="wish-comment-list">
                {(commentsByWish[wish.id] || []).length === 0 && <p>まだコメントはありません。</p>}
                {(commentsByWish[wish.id] || []).map((comment) => (
                  <div className="wish-comment" key={comment.id}>
                    <span>{comment.created_by === memberId ? 'あなた' : 'パートナー'}</span>
                    <p>{comment.body}</p>
                    {comment.created_by === memberId && (
                      <button type="button" disabled={!online || busy} onClick={() => onDeleteComment(comment.id)}>削除</button>
                    )}
                  </div>
                ))}
              </div>
              <form className="wish-comment-form" onSubmit={(event) => submitComment(event, wish.id)}>
                <input
                  type="text"
                  maxLength="300"
                  placeholder="候補日や予算についてコメント"
                  value={commentDrafts[wish.id] || ''}
                  onChange={(event) => setCommentDrafts({ ...commentDrafts, [wish.id]: event.target.value })}
                />
                <button type="submit" disabled={!online || busy}>送信</button>
              </form>
            </details>
          </article>
        ))}
      </div>
    </section>
  )
}
