import './ProgressBar.css'

export default function ProgressBar({ percent }: { percent: number }) {
  const clamped = Math.max(0, Math.min(100, percent))
  return (
    <div className="progress-bar-track">
      <div className="progress-bar-fill" style={{ width: `${clamped}%` }} />
    </div>
  )
}
