/** ブランドマーク：大型提示装置（スクリーン）と、映った合図の緑の点 */
export function Mark({ size = 28, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className={className}>
      <rect x="2" y="2" width="28" height="28" rx="8" fill="#1c1917" />
      <rect x="8" y="9.5" width="16" height="10.5" rx="2" fill="none" stroke="#fff" strokeWidth="2.2" />
      <path d="M16 20v3.5M12 23.5h8" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="16" cy="14.75" r="1.9" fill="#34d399" />
    </svg>
  );
}
