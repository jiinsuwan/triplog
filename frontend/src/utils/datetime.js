// 날짜/시간 유틸 (core). EXIF 촬영시간·여행 기간 표시 등에 사용.

/**
 * Date 를 YYYY-MM-DD 문자열로 변환한다.
 * @param {Date|string|number} value
 * @returns {string}
 */
export function formatDate(value) {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error('formatDate: 유효하지 않은 날짜입니다.')
  }
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
