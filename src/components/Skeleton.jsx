export function SkeletonCard({ lines = 3 }) {
  return (
    <div className="animate-pulse bg-s1 border border-s4 rounded-xl p-4 space-y-3">
      <div className="h-4 bg-s4 rounded w-3/4" />
      {Array.from({ length: lines - 1 }).map((_, i) => (
        <div key={i} className="h-3 bg-s4 rounded" style={{ width: `${60 + Math.random() * 30}%` }} />
      ))}
    </div>
  )
}

export function SkeletonList({ count = 4, lines = 3 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <SkeletonCard key={i} lines={lines} />
      ))}
    </div>
  )
}

export function SkeletonChart() {
  return (
    <div className="animate-pulse bg-s1 border border-s4 rounded-xl p-4">
      <div className="h-4 bg-s4 rounded w-1/3 mb-4" />
      <div className="h-48 bg-s4 rounded" />
    </div>
  )
}
