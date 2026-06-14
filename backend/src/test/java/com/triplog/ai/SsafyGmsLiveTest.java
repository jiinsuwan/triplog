package com.triplog.ai;

import com.triplog.ai.dto.LlmRequest;
import com.triplog.ai.dto.LlmResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * AC1 실연동: 실제 SSAFY GMS 에 1회 호출해 텍스트 응답 수신을 검증한다(이슈 #66 AC1).
 * SSAFY_GMS_KEY 환경변수가 있을 때만 실행되고(평소·CI 는 자동 skip), 크레딧을 소모하므로 수동 1회용이다.
 * test 프로파일(안전한 DB·시크릿)을 쓰되, chat 자동설정만 켜서(properties 오버라이드) 실제 ChatModel 로 호출한다.
 */
@SpringBootTest(properties = "spring.ai.model.chat=openai")
@ActiveProfiles("test")
@EnabledIfEnvironmentVariable(named = "SSAFY_GMS_KEY", matches = ".+")
class SsafyGmsLiveTest {

    @Autowired
    private AiClient aiClient;

    @Test
    void generates_short_text_via_gms() {
        LlmRequest request = new LlmRequest(
                "card-text",
                "전주 한옥마을 골목 사진에 어울리는 짧은 감성 문구 한 줄만 만들어줘.",
                60);

        LlmResponse response = aiClient.generateText(request);

        assertThat(response.text()).isNotBlank();
        System.out.println("[GMS live] model=" + response.model()
                + " tokens(p/c/t)=" + response.promptTokens()
                + "/" + response.completionTokens() + "/" + response.totalTokens());
        System.out.println("[GMS live] text=" + response.text());
    }
}
