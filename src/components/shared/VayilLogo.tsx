import React from 'react'

interface Props {
  size?: number
  textSize?: string
  textColor?: string
  showText?: boolean
}

export function VayilIcon({ size = 32 }: { size?: number }) {
  return (
    <img
      src="/vayil-logo-orange.png"
      alt=""
      aria-hidden="true"
      width={size}
      height={size}
      className="block shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
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
