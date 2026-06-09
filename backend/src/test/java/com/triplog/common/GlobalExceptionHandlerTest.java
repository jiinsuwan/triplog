package com.triplog.common;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

import static org.assertj.core.api.Assertions.assertThat;

class GlobalExceptionHandlerTest {

    private final GlobalExceptionHandler handler = new GlobalExceptionHandler();

    @Test
    void data_integrity_violation_returns_conflict_response() {
        var response = handler.handleDataIntegrityViolation(
                new DataIntegrityViolationException("duplicate key detail"));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.CONFLICT);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("COMMON_002");
        assertThat(response.getBody().message()).isEqualTo("데이터 제약 조건을 위반했습니다.");
        assertThat(response.getBody().data()).isNull();
    }

    @Test
    void max_upload_size_exceeded_returns_payload_too_large_response() {
        var response = handler.handleMaxUploadSize(new MaxUploadSizeExceededException(10L));

        assertThat(response.getStatusCode()).isEqualTo(HttpStatus.PAYLOAD_TOO_LARGE);
        assertThat(response.getBody()).isNotNull();
        assertThat(response.getBody().code()).isEqualTo("PHOTO_003");
        assertThat(response.getBody().data()).isNull();
    }
}
