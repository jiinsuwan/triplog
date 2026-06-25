const HEIC_TYPES = new Set(['image/heic', 'image/heif'])
const HEIC_EXTENSIONS = /\.(heic|heif)$/i

export function isHeicLike(blob, filename = '') {
  return HEIC_TYPES.has(blob?.type) || HEIC_EXTENSIONS.test(filename)
}

export async function createImagePreviewUrl(blob, filename = '') {
  if (!isHeicLike(blob, filename)) {
    return URL.createObjectURL(blob)
  }

  const { default: heic2any } = await import('heic2any')
  const converted = await heic2any({
    blob,
    toType: 'image/jpeg',
    quality: 0.86,
  })
  const jpegBlob = Array.isArray(converted) ? converted[0] : converted
  return URL.createObjectURL(jpegBlob)
}
