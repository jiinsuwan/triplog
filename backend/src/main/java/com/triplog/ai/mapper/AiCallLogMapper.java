package com.triplog.ai.mapper;

import com.triplog.ai.domain.AiCallLog;

/**
 * AiCallLog 적재 mapper. 호출 1건당 1행을 append 한다(조회·집계는 예산 관리 후속 이슈에서).
 */
public interface AiCallLogMapper {

    int insert(AiCallLog log);
}
