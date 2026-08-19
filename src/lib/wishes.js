export function filterWishes(wishes, status = 'open', owner = 'all') {
  return wishes.filter((wish) => {
    const matchesStatus = status === 'all'
      || (status === 'open' && !wish.is_completed)
      || (status === 'done' && wish.is_completed)
    const matchesOwner = owner === 'all' || wish.wanted_by === owner
    return matchesStatus && matchesOwner
  })
}

export function wishOwnerCounts(wishes, status = 'open') {
  const statusWishes = filterWishes(wishes, status)
  return statusWishes.reduce((counts, wish) => {
    counts.all += 1
    counts[wish.wanted_by] = (counts[wish.wanted_by] || 0) + 1
    return counts
  }, { all: 0, 夫: 0, 妻: 0, ふたり: 0 })
}
