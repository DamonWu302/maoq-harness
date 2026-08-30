import type { HeroBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-conversation/client'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

type MaoqMarkProps = SidebarBrandMarkOwnerProps & Pick<HeroBrandMarkOwnerProps, 'className'>

/**
 * Render the MAOQ mark: opposing forces form an M and resolve into an upward route.
 * @param props - Host-supplied mark size and optional geometry class.
 * @returns The decorative MAOQ mark.
 */
export function MaoqBrandMark({ size, className }: MaoqMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      className={className}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M4.5 25V8L12 18.25L19.5 8V25"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M19.5 13L27.5 5M22.75 5H27.5V9.75"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="18.25" r="1.75" fill="currentColor" />
    </svg>
  )
}

/** Render the geometric MAOQ name independently from the mark. */
export function MaoqBrandName() {
  return (
    <svg width="92" height="24" viewBox="0 0 92 24" fill="none" aria-hidden="true">
      <path d="M2 20V4L9 14L16 4V20" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M24 20L31 4L38 20M27 14H35" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="47" y="4" width="16" height="16" rx="7" stroke="currentColor" strokeWidth="2.6" />
      <rect x="72" y="4" width="16" height="16" rx="7" stroke="currentColor" strokeWidth="2.6" />
      <path d="M82 15L90 22" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  )
}
