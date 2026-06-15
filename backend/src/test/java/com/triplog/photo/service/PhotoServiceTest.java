package com.triplog.photo.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.BusinessException;
import com.triplog.photo.domain.OutlineStatus;
import com.triplog.photo.domain.Photo;
import com.triplog.photo.domain.PhotoOutline;
import com.triplog.photo.exif.ExifData;
import com.triplog.photo.exif.ExifExtractor;
import com.triplog.photo.mapper.PhotoMapper;
import com.triplog.photo.mapper.PhotoOutlineMapper;
import com.triplog.photo.outline.PhotoOutlineResponse;
import com.triplog.photo.storage.PhotoStorage;
import com.triplog.trip.mapper.TripMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InOrder;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.Spy;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.time.LocalDateTime;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

/**
 * PhotoService 순수 단위 테스트(Mockito). 핵심 불변식 검증:
 * EXIF 추출은 반드시 store() *전에* 일어나야 한다 — store() 의 transferTo() 가 내부 임시파일을
 * 옮기면 그 뒤 getInputStream() 이 비어버려 EXIF 를 못 읽기 때문이다(#36 설계).
 *
 * 통합 테스트의 MockMultipartFile 은 바이트를 소비하지 않아 이 순서를 강제하지 못한다.
 * 그래서 여기서 InOrder 로 "extract → store" 호출 순서를 직접 못박는다(순서가 뒤집히면 실패).
 */
@ExtendWith(MockitoExtension.class)
class PhotoServiceTest {

    @Mock
    private PhotoMapper photoMapper;
    @Mock
    private PhotoOutlineMapper photoOutlineMapper;
    @Mock
    private PhotoStorage photoStorage;
    @Mock
    private ExifExtractor exifExtractor;
    @Mock
    private TripMapper tripMapper;
    @Spy
    private ObjectMapper objectMapper = new ObjectMapper();
    @InjectMocks
    private PhotoService photoService;

    @Test
    void extracts_exif_before_storing_file() throws Exception {
        MultipartFile file = mock(MultipartFile.class);
        when(file.isEmpty()).thenReturn(false);
        when(file.getContentType()).thenReturn("image/jpeg");
        when(file.getOriginalFilename()).thenReturn("a.jpg");
        when(file.getSize()).thenReturn(3L);
        when(file.getInputStream()).thenReturn(new ByteArrayInputStream(new byte[]{1, 2, 3}));
        when(exifExtractor.extract(any()))
                .thenReturn(new ExifData(LocalDateTime.of(2026, 6, 4, 12, 17, 56), 33.5, 126.5));
        when(photoStorage.store(any(), any())).thenReturn("stored.jpg");
        when(photoMapper.findById(any())).thenReturn(new Photo());

        photoService.upload(1L, List.of(file));

        InOrder order = inOrder(exifExtractor, photoStorage);
        order.verify(exifExtractor).extract(any());
        order.verify(photoStorage).store(any(), any());
    }

    // ---- getOutline (윤곽선 조회 API) ----

    private Photo ownedPhoto(long id, long userId) {
        Photo photo = new Photo();
        photo.setId(id);
        photo.setUserId(userId);
        return photo;
    }

    @Test
    void get_outline_returns_pending_when_no_row() {
        when(photoMapper.findById(5L)).thenReturn(ownedPhoto(5L, 1L));
        when(photoOutlineMapper.findByPhotoId(5L)).thenReturn(null);

        PhotoOutlineResponse r = photoService.getOutline(1L, 5L);

        assertThat(r.status()).isEqualTo(OutlineStatus.PENDING);
        assertThat(r.items()).isNull();
    }

    @Test
    void get_outline_returns_items_when_ready() {
        when(photoMapper.findById(5L)).thenReturn(ownedPhoto(5L, 1L));
        PhotoOutline outline = new PhotoOutline();
        outline.setPhotoId(5L);
        outline.setStatus(OutlineStatus.READY);
        outline.setItems("[{\"id\":0,\"label\":\"cup\"}]");
        when(photoOutlineMapper.findByPhotoId(5L)).thenReturn(outline);

        PhotoOutlineResponse r = photoService.getOutline(1L, 5L);

        assertThat(r.status()).isEqualTo(OutlineStatus.READY);
        assertThat(r.items()).isNotNull();
        assertThat(r.items().get(0).get("label").asText()).isEqualTo("cup");
    }

    @Test
    void get_outline_returns_null_items_when_json_broken() {
        when(photoMapper.findById(5L)).thenReturn(ownedPhoto(5L, 1L));
        PhotoOutline outline = new PhotoOutline();
        outline.setPhotoId(5L);
        outline.setStatus(OutlineStatus.READY);
        outline.setItems("{broken json");
        when(photoOutlineMapper.findByPhotoId(5L)).thenReturn(outline);

        PhotoOutlineResponse r = photoService.getOutline(1L, 5L);

        assertThat(r.status()).isEqualTo(OutlineStatus.READY);
        assertThat(r.items()).isNull();
    }

    @Test
    void get_outline_rejects_other_users_photo() {
        when(photoMapper.findById(5L)).thenReturn(ownedPhoto(5L, 999L));   // 다른 사용자 소유

        assertThatThrownBy(() -> photoService.getOutline(1L, 5L))
                .isInstanceOf(BusinessException.class);
    }
}
