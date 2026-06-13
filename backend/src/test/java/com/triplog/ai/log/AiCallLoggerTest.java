package com.triplog.ai.log;

import com.triplog.ai.domain.AiCallLog;
import com.triplog.ai.mapper.AiCallLogMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AiCallLoggerTest {

    @Mock
    private AiCallLogMapper aiCallLogMapper;

    @InjectMocks
    private AiCallLogger aiCallLogger;

    @Test
    void record_inserts_via_mapper() {
        AiCallLog entry = sampleEntry();

        aiCallLogger.record(entry);

        verify(aiCallLogMapper).insert(entry);
    }

    @Test
    void record_swallows_insert_failure_so_caller_flow_continues() {
        AiCallLog entry = sampleEntry();
        doThrow(new RuntimeException("db down")).when(aiCallLogMapper).insert(any());

        assertThatCode(() -> aiCallLogger.record(entry)).doesNotThrowAnyException();
        verify(aiCallLogMapper).insert(entry);
    }

    private AiCallLog sampleEntry() {
        AiCallLog entry = new AiCallLog();
        entry.setKind("card-text");
        entry.setModel("gpt-4o-mini");
        entry.setPrompt("p");
        entry.setCostMs(10);
        entry.setSuccess(true);
        return entry;
    }
}
