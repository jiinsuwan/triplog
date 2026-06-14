package com.triplog.ai;

import org.junit.jupiter.api.Test;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.model.openai.autoconfigure.OpenAiChatAutoConfiguration;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * P1-1 회귀 가드 (#83 리뷰): default profile 의 LLM chat 자동설정은 fail-closed 여야 한다.
 * application.yml 의 {@code spring.ai.model.chat} 기본값이 none 이면 OpenAiChatAutoConfiguration 의
 * {@code @ConditionalOnProperty(... havingValue="openai")} 가 미충족 → ChatModel 빈을 만들지 않고,
 * 따라서 키가 없어도 부팅 시 api-key 검증으로 컨텍스트가 깨지지 않는다(이슈 #66 AC3).
 * 누군가 기본값을 openai 로 되돌리면(키 누락 환경) 이 계약이 깨지므로 그 회귀를 막는다.
 * DB 등 다른 자동설정과 무관한 AI 단계만 겨냥하려 ApplicationContextRunner 슬라이스로 검증한다.
 */
class OpenAiChatAutoConfigGuardTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(OpenAiChatAutoConfiguration.class));

    @Test
    void chat_none_with_no_key_keeps_context_alive_and_skips_chatmodel() {
        // 프레임워크 계약: chat=none + 키 없음 → OpenAI auto-config 비활성 → 부팅 안전.
        runner.withPropertyValues("spring.ai.model.chat=none", "spring.ai.openai.api-key=")
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    assertThat(context).doesNotHaveBean(ChatModel.class);
                });
    }

    @Test
    void default_profile_resolves_chat_model_to_none() {
        // 우리 설정 회귀 가드: 실제 application.yml 을 default profile 로 로드했을 때(SPRING_AI_MODEL_CHAT
        // env 없음) spring.ai.model.chat 이 none 으로 resolve 되어야 한다. 누가 기본값을 openai 로
        // 되돌리면 여기서 깨진다. DB 등 빈은 만들지 않고 Environment 의 resolved 값만 확인한다.
        new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .run(context -> assertThat(context.getEnvironment().getProperty("spring.ai.model.chat"))
                        .as("application.yml default profile 의 LLM chat 기본값은 fail-closed(none) 여야 한다")
                        .isEqualTo("none"));
    }
}
