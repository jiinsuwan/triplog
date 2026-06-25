const FALLBACKS = {
  '--accent': '#c2693f',
  '--complete': '#c0392b',
  '--ink': '#2c2926',
  '--on-fill': '#fbf8f1',
  '--paper-card': '#fffdf8',
  '--stamp': '#2f4a5c',
  '--t-mustard': '#c39a40',
  '--t-sage': '#6f8a5f',
}

export function tokenColor(name, fallback = FALLBACKS[name] || '') {
  if (typeof document === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

export function tokenAlpha(name, alpha, fallback = FALLBACKS[name] || '#000000') {
  const value = tokenColor(name, fallback)
  const rgb = toRgb(value) || toRgb(fallback)
  if (!rgb) return value
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`
}

function toRgb(color) {
  const value = String(color || '').trim()
  const hex = value.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (hex) {
    const raw = hex[1].length === 3
      ? hex[1].split('').map((ch) => ch + ch).join('')
      : hex[1]
    return [0, 2, 4].map((i) => parseInt(raw.slice(i, i + 2), 16))
  }
  const rgb = value.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])]
  return null
}
