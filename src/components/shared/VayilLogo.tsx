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
      {/* Soft rounded house body */}
      <path
        d="M60 10 L106 52 Q112 58 112 66 L112 100 Q112 112 100 112 L20 112 Q8 112 8 100 L8 66 Q8 58 14 52 Z"
        fill="#E8943A"
      />
      {/* Roof highlight — lighter tan overlay on top triangle */}
      <path
        d="M60 10 L106 52 Q83 42 60 38 Q37 42 14 52 Z"
        fill="#F5C87A"
        opacity="0.75"
      />
      {/* Subtle inner highlight on roof peak */}
      <path
        d="M60 10 L84 38 Q72 35 60 34 Q48 35 36 38 Z"
        fill="#FDEBC0"
        opacity="0.5"
      />
      {/* Large sparkle (4-point star) */}
      <path
        d="M76 67 L78.5 60 L81 67 L88 69.5 L81 72 L78.5 79 L76 72 L69 69.5 Z"
        fill="white"
        opacity="0.95"
      />
      {/* Small sparkle */}
      <path
        d="M83 81 L84.5 76.5 L86 81 L90.5 82.5 L86 84 L84.5 88.5 L83 84 L78.5 82.5 Z"
        fill="white"
        opacity="0.9"
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
