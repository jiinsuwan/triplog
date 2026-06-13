package com.triplog.ai;

import com.triplog.ai.domain.AiCallLog;
import com.triplog.ai.mapper.AiCallLogMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AiCallLog 적재 SQL 통합 검증.
 * 부수 효과로, test 프로파일이 OpenAI chat 자동설정을 끈 상태에서(application.yml: spring.ai.model.chat=none)
 * GMS 키 없이도 Spring 컨텍스트가 정상 로딩되는지(AiClient·SsafyGmsProvider 빈 생성)까지 함께 확인한다.
 */
@SpringBootTest
@ActiveProfiles("test")
@Transactional
class AiCallLogMapperIntegrationTest {

    @Autowired
    private AiCallLogMapper aiCallLogMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Test
    void insert_persists_row_and_assigns_generated_id() {
        AiCallLog entry = new AiCallLog();
        entry.setKind("card-text");
        entry.setModel("gpt-4o-mini");
        entry.setPrompt("전주 한옥마을");
        entry.setResponseJson("골목 따라 걷는 한옥");
        entry.setPromptTokens(12);
        entry.setCompletionTokens(8);
        entry.setTotalTokens(20);
        entry.setCostMs(150);
        entry.setSuccess(true);

        int affected = aiCallLogMapper.insert(entry);

        assertThat(affected).isEqualTo(1);
        assertThat(entry.getId()).isNotNull();
        String model = jdbcTemplate.queryForObject(
                "SELECT model FROM ai_call_log WHERE id = ?", String.class, entry.getId());
        assertThat(model).isEqualTo("gpt-4o-mini");
    }

    @Test
    void insert_allows_null_tokens_and_response_for_failure_record() {
        AiCallLog entry = new AiCallLog();
        entry.setKind("card-text");
        entry.setModel("gpt-4o-mini");
        entry.setPrompt("p");
        entry.setCostMs(40);
        entry.setSuccess(false);
        entry.setErrorMessage("GMS 호출 실패");

        int affected = aiCallLogMapper.insert(entry);

        assertThat(affected).isEqualTo(1);
        Integer totalTokens = jdbcTemplate.queryForObject(
                "SELECT total_tokens FROM ai_call_log WHERE id = ?", Integer.class, entry.getId());
        assertThat(totalTokens).isNull();
        Boolean success = jdbcTemplate.queryForObject(
                "SELECT success FROM ai_call_log WHERE id = ?", Boolean.class, entry.getId());
        assertThat(success).isFalse();
    }
}
