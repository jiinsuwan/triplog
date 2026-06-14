package com.triplog.ai.log;

import com.triplog.ai.domain.AiCallLog;
import com.triplog.ai.mapper.AiCallLogMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * AiCallLog 적재 (architecture §6-1). best-effort + 독립 트랜잭션 정책:
 * 적재 실패가 LLM 호출 흐름(카드 생성 등)을 막지 않도록 예외를 삼키고(이슈 #66 AC3),
 * REQUIRES_NEW 로 호출측 트랜잭션과 분리해 (1)호출측 롤백 시에도 감사 기록을 보존하고
 * (2)적재 실패가 호출측 트랜잭션을 rollback-only 로 오염시키지 않게 한다.
 */
@Component
public class AiCallLogger {

    private static final Logger log = LoggerFactory.getLogger(AiCallLogger.class);

    private final AiCallLogMapper aiCallLogMapper;

    public AiCallLogger(AiCallLogMapper aiCallLogMapper) {
        this.aiCallLogMapper = aiCallLogMapper;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void record(AiCallLog entry) {
        try {
            aiCallLogMapper.insert(entry);
        } catch (RuntimeException e) {
            log.warn("AiCallLog 적재 실패 (호출 흐름은 계속): kind={}, model={}, success={}",
                    entry.getKind(), entry.getModel(), entry.isSuccess(), e);
        }
    }
}
