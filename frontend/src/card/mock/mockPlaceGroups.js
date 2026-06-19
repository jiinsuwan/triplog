// [임시 dev 목업] 카드 "고르기" 화면의 장소별 사진 매칭 구조.
//
// 정본 목업 = docs/design/log-flow-proposal.html ④(사진 고르기): 경로 순서대로 장소(여행지/숙소)를
// 나열하고 장소마다 그 장소 사진을 1:1로 매칭해 고른다.
//
// 그런데 현재 스키마엔 사진↔장소(stop) 연결이 없다(추후 trip 트랙의 사진↔stop 연결 작업). 그래서
// 장소 구조는 아래 목업으로 깔고, 실제 사진(fetchTripPhotos 결과)을 장소별로 순서대로 분배한다.
// → 고른 결과는 실제 photoId라 뒤 단계(AI·렌더)로 이어진다. 실제 연결이 생기면 이 모듈을 그
//   데이터 기반 grouping 으로 교체한다.

const MOCK_PLACES = [
  { name: '제주국제공항', type: '관광지', meta: 'DAY1 09:20', take: 1 },
  { name: '성산일출봉', type: '관광지', meta: 'DAY1 11:40', take: 3 },
  { name: '우진해장국', type: '식당', meta: 'DAY1 19:30', take: 1 },
  { name: '제주 신라스테이', type: '숙소', meta: 'DAY1 숙박', take: 1 },
  { name: '동문시장 골목', type: '관광지', meta: 'DAY2 17:42', take: 4 },
  { name: '협재해수욕장', type: '관광지', meta: 'DAY3 13:00', take: 4 },
]

const TYPE_ICON = { 관광지: '🏛', 식당: '🍽', 카페: '☕', 숙소: '🏨' }

// 실제 사진 목록을 위 목업 장소들에 순서대로 분배한다. 장소보다 사진이 적으면 채워진 장소까지만,
// 많으면 남는 사진을 "기타" 묶음으로 둔다.
export function buildMockPlaceGroups(photos) {
  const list = Array.isArray(photos) ? photos : []
  const groups = []
  let cursor = 0
  let no = 0

  for (const place of MOCK_PLACES) {
    if (cursor >= list.length) break
    const slice = list.slice(cursor, cursor + place.take)
    cursor += place.take
    if (slice.length === 0) continue
    no += 1
    groups.push({
      key: `place-${no}`,
      no,
      name: place.name,
      icon: TYPE_ICON[place.type] ?? '📍',
      meta: `${place.meta} · 사진 ${slice.length}`,
      photos: slice,
    })
  }

  if (cursor < list.length) {
    const rest = list.slice(cursor)
    no += 1
    groups.push({ key: 'place-etc', no, name: '기타', icon: '📷', meta: `사진 ${rest.length}`, photos: rest })
  }
  return groups
}
