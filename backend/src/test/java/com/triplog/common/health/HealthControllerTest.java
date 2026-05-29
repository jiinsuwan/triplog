package com.triplog.common.health;

import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 헬스 엔드포인트 MockMvc 테스트 (architecture §9-1: API = MockMvc).
 * standalone 구성으로 보안·DataSource·Flyway 와 무관하게 컨트롤러와 공통 응답 형식만 검증한다.
 * 전체 컨텍스트/DB 통합 스모크 테스트는 인증·DataSource 가 붙는 Sprint 1 에서 추가한다.
 */
class HealthControllerTest {

    private final MockMvc mockMvc = MockMvcBuilders.standaloneSetup(new HealthController()).build();

    @Test
    void health_returns_success_response() throws Exception {
        mockMvc.perform(get("/api/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.code").value("SUCCESS"))
                .andExpect(jsonPath("$.data.status").value("UP"));
    }
}
