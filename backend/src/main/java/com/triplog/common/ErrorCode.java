package com.triplog.common;

import org.springframework.http.HttpStatus;

/**
 * 단일 에러코드 카탈로그 (architecture §4).
 *
 * 규칙:
 *  - 형식: {도메인}_{3자리숫자} (예: AUTH_001). 성공은 ApiResponse 의 "SUCCESS".
 *  - 도메인 prefix(고정): AUTH / USER / TRIP / PLACE / ITIN / PHOTO / CARD / AI / COMMON
 *    — 패키지명과 일치. 새 prefix 임의 생성 금지.
 *  - 모든 에러코드는 이 enum 한 곳에 모은다. 새 에러 추가 시 중복·충돌을 여기서 확인한다.
 *  - 개별 코드는 각 도메인 구현 시 누적한다. (현재는 core 골격 코드만 존재)
 */
public enum ErrorCode {

    // --- COMMON ---
    INVALID_INPUT("COMMON_001", HttpStatus.BAD_REQUEST, "입력값이 올바르지 않습니다."),
    DATA_INTEGRITY_VIOLATION("COMMON_002", HttpStatus.CONFLICT, "데이터 제약 조건을 위반했습니다."),
    INTERNAL_ERROR("COMMON_500", HttpStatus.INTERNAL_SERVER_ERROR, "서버 내부 오류가 발생했습니다."),

    // --- AUTH ---
    UNAUTHORIZED("AUTH_001", HttpStatus.UNAUTHORIZED, "인증이 필요합니다."),
    INVALID_TOKEN("AUTH_002", HttpStatus.UNAUTHORIZED, "유효하지 않은 토큰입니다."),
    EXPIRED_TOKEN("AUTH_003", HttpStatus.UNAUTHORIZED, "토큰이 만료되었습니다."),
    ACCESS_DENIED("AUTH_004", HttpStatus.FORBIDDEN, "접근 권한이 없습니다."),
    INVALID_CREDENTIALS("AUTH_005", HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 올바르지 않습니다."),
    REFRESH_TOKEN_REUSED("AUTH_006", HttpStatus.UNAUTHORIZED, "이미 사용된 리프레시 토큰입니다."),

    // --- USER ---
    EMAIL_ALREADY_EXISTS("USER_001", HttpStatus.CONFLICT, "이미 가입된 이메일입니다."),
    USER_NOT_FOUND("USER_002", HttpStatus.NOT_FOUND, "사용자를 찾을 수 없습니다."),

    // --- TRIP ---
    TRIP_NOT_FOUND("TRIP_001", HttpStatus.NOT_FOUND, "Trip not found."),
    TRIP_ACCESS_DENIED("TRIP_002", HttpStatus.FORBIDDEN, "Trip access denied."),
    TRIP_INVALID_INPUT("TRIP_003", HttpStatus.BAD_REQUEST, "Invalid trip input."),

    // --- PHOTO ---
    PHOTO_NO_FILES("PHOTO_001", HttpStatus.BAD_REQUEST, "업로드할 사진이 없습니다."),
    PHOTO_UNSUPPORTED_TYPE("PHOTO_002", HttpStatus.BAD_REQUEST, "지원하지 않는 이미지 형식입니다."),
    PHOTO_TOO_LARGE("PHOTO_003", HttpStatus.PAYLOAD_TOO_LARGE, "사진 용량이 제한을 초과했습니다."),
    PHOTO_STORAGE_FAILED("PHOTO_500", HttpStatus.INTERNAL_SERVER_ERROR, "사진 저장에 실패했습니다.");

    private final String code;
    private final HttpStatus status;
    private final String message;

    ErrorCode(String code, HttpStatus status, String message) {
        this.code = code;
        this.status = status;
        this.message = message;
    }

    public String getCode() {
        return code;
    }

    public HttpStatus getStatus() {
        return status;
    }

    public String getMessage() {
        return message;
    }
}
