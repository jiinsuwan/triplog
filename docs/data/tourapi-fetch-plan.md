# TourAPI 장소 데이터 수집 메모

## 목적

- 전국 기본 데이터: 지도 표시와 전국 단위 장소 검색용 얕은 데이터.
- 제주 상세 데이터: AI 추천과 임베딩 품질 검증용 깊은 데이터.
- 기존 350개 상세 샘플은 폐기 후보이며, 새 수집 기준 파일에는 포함하지 않는다.
- 이 단계에서는 MySQL/PostgreSQL에 쓰지 않고 JSONL 파일로만 저장한다.

## 키 관리

`.env`에는 Encoding 인증키를 변수명으로 나눠 저장한다. 키 값은 커밋하지 않는다.

```env
TOUR_API_KEY_OLD=기존_인코딩키
TOUR_API_KEY_NEW=새_인코딩키
```

## 출력 구조

```text
data/tourapi/out/national-basic/
  places.jsonl
  summary.json
  state.json

data/tourapi/out/jeju-detailed/
  places.jsonl
  summary.json
  state.json
  area-index.json
```

## 전국 기본 수집 타입

전국 기본 프리셋은 지도 표시와 타입별 조회 준비를 위해 아래 TourAPI content type을 수집한다.

```text
12 관광지
14 문화시설
15 행사/공연/축제
25 여행코스
28 레포츠
32 숙박
38 쇼핑
39 음식점
```

이 중 #104 필수 확장 대상은 `14`, `15`, `25`, `32`, `38`이며, `12`는 기존 관광지 회귀 확인용, `39`는 최종 명세의 음식점 조회 요구 대응용, `28`은 전국 지도 후보 확장용 보조 타입이다.

`places.jsonl`의 `placeType`과 `category`는 우선 ASCII 코드값(`LODGING`, `CULTURE` 등)으로 저장한다. 한글 표시명은 DB 적재/프론트 표시 단계에서 매핑한다.

좌표는 지도 표시 품질을 위해 한국 대략 경계(`latitude` 32~39, `longitude` 124~132) 안에 있는 항목만 저장한다. TourAPI 응답에 placeholder/비정상 좌표가 섞일 수 있으므로, 수집 스크립트와 DB seed migration이 같은 기준으로 방어한다.

## 중복 및 이어받기

- `-Resume`이면 기존 `places.jsonl`을 읽어 이미 저장된 `sourceId`를 건너뛴다.
- `state.json`은 content type별 다음 `pageNo`를 저장한다.
- 페이지를 끝까지 처리한 뒤에만 다음 페이지로 커서를 이동한다.
- 제한 개수 때문에 페이지 중간에서 멈추면 같은 페이지부터 다시 시작한다.
- 같은 페이지를 다시 호출해도 이미 저장된 장소의 상세 API는 호출하지 않는다.
- 완료된 content type은 다음 실행에서 빈 다음 페이지 확인 호출도 하지 않는다.
- `state.json`과 `places.jsonl`은 한 쌍으로 본다. state만 있고 output이 없으면 중단한다.
- `RowsPerPage`, preset, 지역 조건이 state와 다르면 중단한다. 이어받는 동안 임의로 바꾸지 않는다.
- 상세 수집 여부도 state와 다르면 중단한다. 예를 들어 제주 상세를 받던 폴더에 `-SkipDetails`로 이어 저장하지 않는다.
- 기본적으로 resume 시 직전 커서에서 1페이지를 겹쳐 다시 본다. 이미 저장된 장소는 상세 호출 전에 건너뛰므로, 목록 API 몇 회를 더 쓰는 대신 정렬 변동 누락 위험을 줄인다.
- 상세 API 실패 ID는 `state.json`에 기록하고 다시 상세 호출하지 않는다. 일시 실패를 재시도하려면 `-RetryFailedIds`를 붙인다. 이 옵션은 저장된 ID는 건너뛰면서 실패 ID 재시도를 위해 커서를 1페이지로 되돌린다.
- 기존 output/state가 있으면 기본 실행은 중단한다. 이어받기는 `-Resume`, 초기화는 `-ForceReset`을 명시한다.
- 제주 상세의 지역 코드표는 `area-index.json`으로 캐시한다.
- `MaxItemsPerType`, `MaxTotalItems`는 이번 실행에서 새로 저장할 개수 제한이다. 전체 누적 제한이 필요하면 별도 import 단계에서 판단한다.

## 실행 예시

기존 키의 남은 호출량으로 제주 상세를 조금 수집한다. 상세는 장소 1개당 보통 목록 외 `detailCommon2`, `detailIntro2` 2회가 추가로 든다.

```powershell
.\scripts\fetch-tourapi-places.ps1 `
  -Preset JejuDetailed `
  -ServiceKeyEnvName TOUR_API_KEY_OLD `
  -MaxTotalItems 80 `
  -Resume
```

상세 실패 ID를 다시 시도하고 싶을 때:

```powershell
.\scripts\fetch-tourapi-places.ps1 `
  -Preset JejuDetailed `
  -ServiceKeyEnvName TOUR_API_KEY_OLD `
  -MaxTotalItems 80 `
  -Resume `
  -RetryFailedIds
```

새 키로 전국 기본 데이터를 수집한다. 이 프리셋은 장소별 상세 API를 부르지 않는다.

```powershell
.\scripts\fetch-tourapi-places.ps1 `
  -Preset NationalBasic `
  -ServiceKeyEnvName TOUR_API_KEY_NEW `
  -MaxItemsPerType 0 `
  -MaxTotalItems 0 `
  -RowsPerPage 1000 `
  -Resume
```

처음부터 새로 받고 싶을 때만 `-ForceReset`을 사용한다.

```powershell
.\scripts\fetch-tourapi-places.ps1 `
  -Preset NationalBasic `
  -ServiceKeyEnvName TOUR_API_KEY_NEW `
  -MaxItemsPerType 0 `
  -MaxTotalItems 0 `
  -RowsPerPage 1000 `
  -ForceReset
```

작은 샘플 테스트는 사용자 승인 후에만 실행한다.
