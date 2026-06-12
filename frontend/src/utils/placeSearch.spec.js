import { describe, expect, it } from 'vitest'

import {
  buildDbPlaceQuery,
  buildKakaoKeyword,
  filterPlacesByTab,
  isWithinPlaceRegion,
  normalizeDbPlace,
  normalizeKakaoPlace,
  resolvePlaceRegion,
} from './placeSearch'

describe('placeSearch utils', () => {
  it('DB 관광지를 지도 화면에서 쓰는 공통 place 모델로 변환한다', () => {
    expect(
      normalizeDbPlace({
        id: 7,
        name: '경기전 돌담길',
        category: '명소',
        roadAddress: '전북 전주시 완산구',
        latitude: '35.814',
        longitude: '127.153',
        summary: '한옥마을 산책길',
      }),
    ).toMatchObject({
      uid: 'db-7',
      origin: 'db',
      name: '경기전 돌담길',
      markerLabel: '경기전 돌담길',
      latitude: 35.814,
      longitude: 127.153,
      sourceLabel: 'DB 관광지',
    })
  })

  it('카카오 장소를 공통 place 모델로 변환한다', () => {
    expect(
      normalizeKakaoPlace({
        id: 'abc',
        place_name: '남부시장 청년몰',
        category_group_name: '음식점',
        x: '127.148',
        y: '35.812',
      }),
    ).toMatchObject({
      uid: 'kakao-abc',
      origin: 'kakao',
      name: '남부시장 청년몰',
      markerLabel: '식당',
      longitude: 127.148,
      latitude: 35.812,
      sourceLabel: 'Kakao',
    })
  })

  it('탭에 맞게 관광지와 카카오 장소를 필터링한다', () => {
    const places = [
      { origin: 'db', category: '명소', categoryGroup: '관광지' },
      { origin: 'kakao', category: '음식점 > 한식', categoryGroup: '음식점' },
      { origin: 'kakao', category: '카페', categoryGroup: '카페' },
    ]

    expect(filterPlacesByTab(places, 'attraction')).toHaveLength(1)
    expect(filterPlacesByTab(places, 'restaurant')).toHaveLength(1)
    expect(filterPlacesByTab(places, 'cafe')).toHaveLength(1)
    expect(filterPlacesByTab(places, 'all')).toHaveLength(3)
  })

  it('검색어가 없을 때 지역과 탭으로 카카오 기본 키워드를 만든다', () => {
    expect(buildKakaoKeyword({ region: '전주', tab: 'restaurant' })).toBe('전주 맛집')
    expect(buildKakaoKeyword({ region: '제주', tab: 'cafe' })).toBe('제주 카페')
    expect(buildKakaoKeyword({ keyword: '객리단길', region: '전주', tab: 'restaurant' })).toBe(
      '전주 객리단길 맛집',
    )
  })

  it('지역명 검색은 DB keyword 가 아니라 region 필터로 변환한다', () => {
    expect(buildDbPlaceQuery({ keyword: '서울', fallbackRegion: '부산' })).toEqual({
      region1: '서울특별시',
      region2: undefined,
      keyword: undefined,
    })

    expect(buildDbPlaceQuery({ keyword: '박물관', fallbackRegion: '서울' })).toEqual({
      region1: '서울특별시',
      region2: undefined,
      keyword: '박물관',
    })
  })

  it('백엔드 region 목록으로 구·군 단위 지역명을 동적으로 해석한다', () => {
    const regions = [
      { region1: '서울특별시', region2: '용산구', count: 12 },
      { region1: '전북특별자치도', region2: '전주시', count: 20 },
    ]

    expect(buildDbPlaceQuery({ keyword: '용산', fallbackRegion: '전주', regions })).toEqual({
      region1: '서울특별시',
      region2: '용산구',
      keyword: undefined,
    })

    expect(buildKakaoKeyword({ keyword: '용산', region: '전주', tab: 'restaurant', regions })).toBe(
      '서울특별시 용산구 맛집',
    )

    expect(buildDbPlaceQuery({ keyword: '용산역', fallbackRegion: '전주', regions })).toEqual({
      region1: '서울특별시',
      region2: '용산구',
      keyword: undefined,
    })
  })

  it('지역 뷰포트 밖 좌표를 제외할 수 있다', () => {
    const seoul = resolvePlaceRegion({ keyword: '서울' })

    expect(isWithinPlaceRegion({ latitude: 37.57, longitude: 126.98 }, seoul)).toBe(true)
    expect(isWithinPlaceRegion({ latitude: 37.88, longitude: 127.73 }, seoul)).toBe(false)
  })
})
