export const PLACE_CATEGORY_OPTIONS = [
  { label: '전체', value: 'all' },
  { label: '볼만한 곳', value: 'attraction' },
  { label: '맛집', value: 'food' },
  { label: '카페', value: 'cafe' },
  { label: '숙소', value: 'stay' },
]

export const MOCK_REGION_OPTIONS = [
  { label: '전주', value: '전주' },
  { label: '제주', value: '제주' },
  { label: '부산', value: '부산' },
  { label: '서울', value: '서울' },
]

export const MOCK_PLACES = [
  {
    id: 'jj-gyonggijeon',
    region: '전주',
    name: '경기전 돌담길',
    category: 'attraction',
    categoryLabel: '명소',
    area: '전북 전주시 완산구',
    summary: '한옥마을 산책의 시작점으로 좋은 고즈넉한 돌담길',
    rating: 4.7,
    reviews: 840,
    x: 44,
    y: 42,
    tags: ['산책', '한옥', '사진'],
  },
  {
    id: 'jj-jeondong',
    region: '전주',
    name: '전동성당',
    category: 'attraction',
    categoryLabel: '명소',
    area: '태조로',
    summary: '붉은 벽돌과 한옥 지붕이 같이 보이는 전주 대표 랜드마크',
    rating: 4.6,
    reviews: 1260,
    x: 58,
    y: 35,
    tags: ['랜드마크', '야경', '사진'],
  },
  {
    id: 'jj-nambu',
    region: '전주',
    name: '남부시장 청년몰',
    category: 'food',
    categoryLabel: '맛집',
    area: '풍남문2길',
    summary: '야시장과 작은 식당을 함께 둘러보기 좋은 골목',
    rating: 4.4,
    reviews: 620,
    x: 52,
    y: 67,
    tags: ['야시장', '골목', '간식'],
  },
  {
    id: 'jj-cafe-yard',
    region: '전주',
    name: '카페 아원',
    category: 'cafe',
    categoryLabel: '카페',
    area: '은행로',
    summary: '한옥마을 골목 안쪽의 조용한 마당 카페',
    rating: 4.5,
    reviews: 310,
    x: 70,
    y: 54,
    tags: ['한옥카페', '마당', '디저트'],
  },
  {
    id: 'jj-hanok-stay',
    region: '전주',
    name: '한옥 스테이 서온',
    category: 'stay',
    categoryLabel: '숙소',
    area: '최명희길',
    summary: '도보 여행 동선에 넣기 좋은 한옥 숙소',
    rating: 4.8,
    reviews: 190,
    x: 35,
    y: 58,
    tags: ['한옥숙소', '조식', '도보'],
  },
  {
    id: 'jj-kalguksu',
    region: '전주',
    name: '베테랑 칼국수',
    category: 'food',
    categoryLabel: '맛집',
    area: '경기전길',
    summary: '짧은 점심 동선에 넣기 좋은 전주식 칼국수집',
    rating: 4.3,
    reviews: 2210,
    x: 67,
    y: 28,
    tags: ['칼국수', '점심', '회전빠름'],
  },
  {
    id: 'jj-pnb',
    region: '전주',
    name: '풍년제과 본점',
    category: 'food',
    categoryLabel: '맛집',
    area: '팔달로',
    summary: '초코파이 선물과 간식 코스로 넣기 좋은 오래된 제과점',
    rating: 4.2,
    reviews: 1800,
    x: 39,
    y: 73,
    tags: ['빵', '선물', '간식'],
  },
  {
    id: 'jeju-udo',
    region: '제주',
    name: '우도 해안길',
    category: 'attraction',
    categoryLabel: '명소',
    area: '제주시 우도면',
    summary: '바다와 언덕을 같이 볼 수 있는 제주 동쪽 산책 코스',
    rating: 4.8,
    reviews: 1540,
    x: 73,
    y: 34,
    tags: ['바다', '자전거', '전망'],
  },
  {
    id: 'jeju-noeul',
    region: '제주',
    name: '노을 해녀식당',
    category: 'food',
    categoryLabel: '맛집',
    area: '구좌읍',
    summary: '해산물 한 상과 바다뷰를 함께 넣기 좋은 식당',
    rating: 4.5,
    reviews: 760,
    x: 56,
    y: 58,
    tags: ['해산물', '바다뷰', '저녁'],
  },
  {
    id: 'jeju-forest',
    region: '제주',
    name: '비자림 숲길',
    category: 'attraction',
    categoryLabel: '명소',
    area: '구좌읍',
    summary: '비 오는 날에도 걷기 좋은 숲길 코스',
    rating: 4.7,
    reviews: 980,
    x: 42,
    y: 45,
    tags: ['숲길', '산책', '비오는날'],
  },
  {
    id: 'busan-huinnyeoul',
    region: '부산',
    name: '흰여울 문화마을',
    category: 'attraction',
    categoryLabel: '명소',
    area: '영도구',
    summary: '골목과 바다를 함께 보는 부산 산책 코스',
    rating: 4.6,
    reviews: 1180,
    x: 50,
    y: 46,
    tags: ['바다', '골목', '사진'],
  },
  {
    id: 'busan-milmyeon',
    region: '부산',
    name: '초량 밀면',
    category: 'food',
    categoryLabel: '맛집',
    area: '동구',
    summary: '부산역 근처 첫 끼로 넣기 좋은 밀면집',
    rating: 4.3,
    reviews: 920,
    x: 38,
    y: 62,
    tags: ['밀면', '점심', '부산역'],
  },
  {
    id: 'seoul-seochon',
    region: '서울',
    name: '서촌 골목길',
    category: 'attraction',
    categoryLabel: '명소',
    area: '종로구',
    summary: '작은 상점과 전시를 이어 걷는 서울 골목 코스',
    rating: 4.5,
    reviews: 880,
    x: 45,
    y: 48,
    tags: ['골목', '전시', '산책'],
  },
  {
    id: 'seoul-cafe',
    region: '서울',
    name: '통인동 커피집',
    category: 'cafe',
    categoryLabel: '카페',
    area: '통인동',
    summary: '서촌 산책 중 쉬어가기 좋은 작은 카페',
    rating: 4.4,
    reviews: 410,
    x: 62,
    y: 57,
    tags: ['커피', '디저트', '서촌'],
  },
]

export function getPlacesByRegion(region) {
  return MOCK_PLACES.filter((place) => place.region === region)
}

export function filterPlaces(places, { category = 'all', keyword = '' } = {}) {
  const normalizedKeyword = keyword.trim().toLowerCase()
  return places.filter((place) => {
    const categoryMatched = category === 'all' || place.category === category
    const keywordMatched =
      !normalizedKeyword ||
      [place.name, place.area, place.summary, place.categoryLabel, ...place.tags]
        .join(' ')
        .toLowerCase()
        .includes(normalizedKeyword)

    return categoryMatched && keywordMatched
  })
}

export function toggleSavedPlace(savedPlaces, place) {
  const exists = savedPlaces.some((item) => item.id === place.id)
  if (exists) {
    return savedPlaces.filter((item) => item.id !== place.id)
  }
  return [...savedPlaces, place]
}

export function isPlaceSaved(savedPlaces, placeId) {
  return savedPlaces.some((place) => place.id === placeId)
}
