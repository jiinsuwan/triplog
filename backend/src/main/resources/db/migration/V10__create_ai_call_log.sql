-- Sprint 3 core (S3-CORE-02 #66): AI(LLM) 호출 공통 인프라의 호출 기록 테이블.
-- 모든 LLM 호출(카드 문구 생성 등)을 모델·토큰·지연·성공여부와 함께 적재한다 — 비용 감사(R2)·디버깅 토대.
-- architecture §3 AiCallLog 명세 + 이슈 #66 Scope("모델·토큰·지연·성공여부") 반영.
--   * GMS 는 호출 1회당 크레딧을 차감하므로 model 별 호출 횟수 집계가 예산 관리의 핵심이다.
--   * 토큰 컬럼은 provider 가 usage 를 줄 때만 채운다(없으면 NULL — "측정 불가"와 0 을 구분).
-- user_id 미선언: 호출 주체별 집계가 필요해지면 후속 이슈가 forward-nullable 컬럼+인덱스를 추가한다.
-- 머지 주의: V9(#68 password_reset_tokens) 가 먼저 main 에 올라간 뒤 이 V10 을 머지한다
--   (Flyway out-of-order=false — V9 결번 상태로 V10 을 먼저 올리면 마이그레이션이 깨진다).
CREATE TABLE IF NOT EXISTS ai_call_log (
    id                BIGINT        NOT NULL AUTO_INCREMENT,
    kind              VARCHAR(50)   NOT NULL,                      -- 호출 종류(예: card-text)
    model             VARCHAR(100)  NOT NULL,                      -- 사용 모델 식별자(예: gpt-4o-mini)
    prompt            TEXT          NOT NULL,                      -- 입력 프롬프트(짧게 유지 — 크레딧 예산)
    response_json     TEXT          NULL,                          -- 응답 원문(실패 시 NULL)
    prompt_tokens     INT           NULL,                          -- 입력 토큰(provider usage 제공 시)
    completion_tokens INT           NULL,                          -- 출력 토큰(동상)
    total_tokens      INT           NULL,                          -- 합계(동상, 측정 불가면 NULL)
    cost_ms           INT           NOT NULL,                      -- 호출 지연(ms)
    success           TINYINT(1)    NOT NULL,                      -- 성공 여부
    error_message     VARCHAR(500)  NULL,                          -- 실패 사유 요약(감사·디버깅용)
    created_at        DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    KEY idx_ai_call_log_created (created_at, id)
) ENGINE = InnoDB DEFAULT CHARSET = utf8mb4;
