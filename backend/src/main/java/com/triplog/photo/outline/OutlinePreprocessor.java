package com.triplog.photo.outline;

import com.triplog.photo.domain.Photo;
import com.triplog.photo.mapper.PhotoMapper;
import com.triplog.photo.mapper.PhotoOutlineMapper;
import com.triplog.photo.storage.PhotoStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * 백그라운드 윤곽선 전처리 워커 (S3-LOG-02 #70).
 * 업로드와 분리돼 PENDING 사진을 하나씩 추론 서버에 보내 윤곽선을 받아 저장한다.
 * 추론 서버 장애·타임아웃은 여기서 흡수한다(FAILED 로 기록) — 업로드·카드 기본 동작엔 영향 없음.
 * worker-enabled=false(테스트·추론 서버 없는 환경)면 빈 자체가 생성되지 않아 폴링하지 않는다.
 */
@Component
@ConditionalOnProperty(name = "inference.worker-enabled", havingValue = "true", matchIfMissing = true)
public class OutlinePreprocessor {

    private static final Logger log = LoggerFactory.getLogger(OutlinePreprocessor.class);
    private static final int ERROR_MAX = 500;

    private final PhotoOutlineMapper outlineMapper;
    private final PhotoMapper photoMapper;
    private final PhotoStorage photoStorage;
    private final InferenceClient inferenceClient;
    private final InferenceProperties props;

    public OutlinePreprocessor(PhotoOutlineMapper outlineMapper, PhotoMapper photoMapper,
                               PhotoStorage photoStorage, InferenceClient inferenceClient,
                               InferenceProperties props) {
        this.outlineMapper = outlineMapper;
        this.photoMapper = photoMapper;
        this.photoStorage = photoStorage;
        this.inferenceClient = inferenceClient;
        this.props = props;
    }

    /**
     * 주기적으로 PENDING 사진을 가져와 하나씩 전처리한다(워커=1 직렬 처리에 맞춰 batchSize 기본 1).
     * 동시성: {@code @Scheduled(fixedDelay)} 는 단일 스케줄러 스레드에서 직전 실행이 끝난 뒤에만
     * 다음 실행을 시작하므로 자기 자신과 겹치지 않는다. 따라서 단일 인스턴스에선 같은 photo 중복
     * 처리나 READY→FAILED 덮어쓰기가 없어 별도 claim/lock 이 필요 없다(#70 리뷰 P2).
     * 다중 인스턴스로 확장하면 PENDING→PROCESSING 낙관적 claim 이 필요하다 — 현재 범위 밖.
     */
    @Scheduled(fixedDelayString = "${inference.poll-delay:3000}")
    public void processPending() {
        List<Long> pending = outlineMapper.findPendingPhotoIds(props.getBatchSize());
        for (Long photoId : pending) {
            processOne(photoId);
        }
    }

    private void processOne(Long photoId) {
        try {
            Photo photo = photoMapper.findById(photoId);
            if (photo == null) {
                outlineMapper.markFailed(photoId, "사진 메타 없음");
                return;
            }
            byte[] bytes = readBytes(photo.getStoredFilename());
            InferenceClient.PreprocessResult result = inferenceClient.preprocess(bytes, photo.getStoredFilename());
            outlineMapper.markReady(photoId, result.items(), result.imageId());
        } catch (Exception e) {
            // 추론 서버 다운·타임아웃·읽기 실패 모두 흡수 → FAILED. 업로드·카드 기본 동작엔 영향 없음.
            log.warn("윤곽선 전처리 실패 photoId={}: {}", photoId, e.getMessage());
            outlineMapper.markFailed(photoId, truncate(e.getMessage()));
        }
    }

    private byte[] readBytes(String storedFilename) {
        try (var in = photoStorage.load(storedFilename).getInputStream()) {   // try-with-resources 로 스트림 누수 방지
            return in.readAllBytes();
        } catch (Exception e) {
            throw new InferenceException("사진 읽기 실패: " + storedFilename, e);
        }
    }

    private String truncate(String message) {
        if (message == null) {
            return "unknown";
        }
        return message.length() > ERROR_MAX ? message.substring(0, ERROR_MAX) : message;
    }
}
