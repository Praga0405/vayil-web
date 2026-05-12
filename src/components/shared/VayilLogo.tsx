import React from 'react'

interface Props {
  size?: number
  textSize?: string
  textColor?: string
  showText?: boolean
}

export function VayilIcon({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" fill="none">
      <defs>
        <linearGradient id="vayilBodyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#F0A852" />
          <stop offset="100%" stopColor="#E8943A" />
        </linearGradient>
        <linearGradient id="vayilRoofSheen" x1="0%" y1="0%" x2="0%" y2="100%">
          <stop offset="0%" stopColor="#FDEBC0" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#F5C87A" stopOpacity="0.4" />
        </linearGradient>
      </defs>

      {/* Rounded house body */}
      <rect x="8" y="54" width="104" height="58" rx="16" ry="16" fill="url(#vayilBodyGrad)" />

      {/* Roof — triangle with soft curved peak */}
      <path
        d="M60 9 C62 9 64 10 65.5 11.5 L109 53 Q111 55 109 57 L11 57 Q9 55 11 53 L54.5 11.5 C56 10 58 9 60 9 Z"
        fill="url(#vayilBodyGrad)"
      />

      {/* Roof sheen overlay */}
      <path
        d="M60 9 C62 9 64 10 65.5 11.5 L100 47 Q80 39 60 37 Q40 39 20 47 L54.5 11.5 C56 10 58 9 60 9 Z"
        fill="url(#vayilRoofSheen)"
      />

      {/* Large 4-point sparkle */}
      <path
        d="M76 66 L78.5 59 L81 66 L88 68.5 L81 71 L78.5 78 L76 71 L69 68.5 Z"
        fill="white"
        opacity="0.95"
      />

      {/* Small sparkle */}
      <path
        d="M83 80 L84.2 76.5 L85.5 80 L89.5 81.2 L85.5 82.5 L84.2 86 L83 82.5 L79 81.2 Z"
        fill="white"
        opacity="0.85"
      />
    </svg>
  )
}

export default function VayilLogo({ size = 32, textSize = 'text-xl', textColor = 'text-navy', showText = true }: Props) {
  return (
    <span className="inline-flex items-center gap-2">
      <VayilIcon size={size} />
      {showText && <span className={`font-bold ${textSize} ${textColor}`}>Vayil</span>}
    </span>
  )
}
