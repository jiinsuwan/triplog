package com.triplog.common.health;

import com.triplog.common.ApiResponse;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 헬스 체크 엔드포인트 (core). 서버 기동/공통 응답 형식 확인용.
 */
@Tag(name = "Health", description = "서버 상태 확인")
@RestController
@RequestMapping("/api/health")
public class HealthController {

    @Operation(summary = "헬스 체크", description = "서버가 정상 동작하는지 확인한다.")
    @GetMapping
    public ApiResponse<Map<String, String>> health() {
        return ApiResponse.success(Map.of("status", "UP"));
    }
}
