package com.triplog.photo.outline;

import com.triplog.photo.domain.Photo;
import com.triplog.photo.mapper.PhotoMapper;
import com.triplog.photo.mapper.PhotoOutlineMapper;
import com.triplog.photo.storage.PhotoStorage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.core.io.ByteArrayResource;

import java.util.List;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * 백그라운드 윤곽선 전처리 워커 단위 테스트.
 * 핵심 = graceful degradation: 추론 서버 실패가 markFailed 로 흡수되고(업로드·카드 불영향),
 * 성공은 markReady 로 저장된다. 사진 메타가 없으면 추론 호출 없이 FAILED 로 종료한다.
 */
@ExtendWith(MockitoExtension.class)
class OutlinePreprocessorTest {

    @Mock
    private PhotoOutlineMapper outlineMapper;
    @Mock
    private PhotoMapper photoMapper;
    @Mock
    private PhotoStorage photoStorage;
    @Mock
    private InferenceClient inferenceClient;
    @Mock
    private InferenceProperties props;

    private OutlinePreprocessor preprocessor() {
        when(props.getBatchSize()).thenReturn(1);
        return new OutlinePreprocessor(outlineMapper, photoMapper, photoStorage, inferenceClient, props);
    }

    private Photo photo(long id) {
        Photo photo = new Photo();
        photo.setId(id);
        photo.setStoredFilename("stored-" + id + ".jpg");
        return photo;
    }

    @Test
    void success_marks_ready_with_items() {
        when(outlineMapper.findPendingPhotoIds(1)).thenReturn(List.of(7L));
        when(photoMapper.findById(7L)).thenReturn(photo(7L));
        when(photoStorage.load("stored-7.jpg")).thenReturn(new ByteArrayResource(new byte[]{1, 2, 3}));
        when(inferenceClient.preprocess(any(), eq("stored-7.jpg")))
                .thenReturn(new InferenceClient.PreprocessResult("[{\"id\":0}]", "img-7"));

        preprocessor().processPending();

        verify(outlineMapper).markReady(7L, "[{\"id\":0}]", "img-7");
        verify(outlineMapper, never()).markFailed(anyLong(), any());
    }

    @Test
    void inference_failure_is_absorbed_into_failed() {
        when(outlineMapper.findPendingPhotoIds(1)).thenReturn(List.of(7L));
        when(photoMapper.findById(7L)).thenReturn(photo(7L));
        when(photoStorage.load("stored-7.jpg")).thenReturn(new ByteArrayResource(new byte[]{1}));
        when(inferenceClient.preprocess(any(), any())).thenThrow(new InferenceException("추론 서버 다운"));

        preprocessor().processPending();

        verify(outlineMapper).markFailed(eq(7L), any());
        verify(outlineMapper, never()).markReady(anyLong(), any(), any());
    }

    @Test
    void missing_photo_is_marked_failed_without_calling_inference() {
        when(outlineMapper.findPendingPhotoIds(1)).thenReturn(List.of(9L));
        when(photoMapper.findById(9L)).thenReturn(null);

        preprocessor().processPending();

        verify(outlineMapper).markFailed(eq(9L), any());
        verifyNoInteractions(inferenceClient);
    }
}
