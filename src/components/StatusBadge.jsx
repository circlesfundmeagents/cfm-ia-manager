export default function StatusBadge({ status }) {
  const label = status?.replace(/_/g, ' ')
  return <span className={`badge status-${status}`}>{label}</span>
}
