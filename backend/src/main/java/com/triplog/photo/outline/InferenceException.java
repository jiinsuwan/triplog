package com.triplog.photo.outline;

/**
 * 추론 서버 호출 실패(연결 불가·타임아웃·작업 실패·응답 파싱 실패 등).
 * 백그라운드 워커가 흡수해 전처리 상태를 FAILED 로 남긴다 — 업로드·카드 기본 동작엔 영향 없음.
 */
public class InferenceException extends RuntimeException {

    public InferenceException(String message) {
        super(message);
    }

    public InferenceException(String message, Throwable cause) {
        super(message, cause);
    }
}
