package com.triplog.photo.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.domain.OutlineStatus;
import com.triplog.photo.domain.Photo;
import com.triplog.photo.domain.PhotoOutline;
import com.triplog.photo.dto.PhotoContent;
import com.triplog.photo.dto.PhotoResponse;
import com.triplog.photo.exif.ExifData;
import com.triplog.photo.exif.ExifExtractor;
import com.triplog.photo.mapper.PhotoMapper;
import com.triplog.photo.mapper.PhotoOutlineMapper;
import com.triplog.photo.outline.PhotoOutlineResponse;
import com.triplog.photo.storage.PhotoStorage;
import com.triplog.trip.domain.Trip;
import com.triplog.trip.mapper.TripMapper;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * 다중 사진 업로드. 형식 검증 → 디스크 저장 → 메타 기록.
 * (크기 검증은 multipart 컨테이너 한도 + MaxUploadSizeExceededException 핸들러가 담당.)
 */
@Service
public class PhotoService {

    // 허용 이미지 형식 → 저장 확장자. 이 맵의 key 집합이 곧 형식 화이트리스트다(SVG 등 비포함).
    private static final Map<String, String> ALLOWED_TYPES = Map.of(
            "image/jpeg", ".jpg",
            "image/png", ".png",
            "image/webp", ".webp",
            "image/heic", ".heic",
            "image/heif", ".heif");

    private static final String FALLBACK_NAME = "unnamed";

    private final PhotoMapper photoMapper;
    private final PhotoOutlineMapper photoOutlineMapper;
    private final PhotoStorage photoStorage;
    private final ExifExtractor exifExtractor;
    private final TripMapper tripMapper;
    private final ObjectMapper objectMapper;

    public PhotoService(PhotoMapper photoMapper, PhotoOutlineMapper photoOutlineMapper,
                        PhotoStorage photoStorage, ExifExtractor exifExtractor,
                        TripMapper tripMapper, ObjectMapper objectMapper) {
        this.photoMapper = photoMapper;
        this.photoOutlineMapper = photoOutlineMapper;
        this.photoStorage = photoStorage;
        this.exifExtractor = exifExtractor;
        this.tripMapper = tripMapper;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public List<PhotoResponse> upload(Long userId, List<MultipartFile> files) {
        validateUserId(userId);
        List<MultipartFile> targets = nonEmpty(files);

        // 1차: 전부 형식 검증 + 확장자 계산. 한 장이라도 invalid 면 디스크에 아무것도 쓰지 않고 실패한다.
        List<String> extensions = targets.stream().map(this::resolveExtension).toList();

        // 저장한 파일명을 모아 두고, 트랜잭션이 롤백되면 정리한다(고아 파일 방지).
        // try/catch 는 "메서드 실행 중" 예외만 잡는다. 그러나 DB commit 은 이 메서드가 반환된 *뒤*
        // 일어나므로, commit 단계에서 실패하면 롤백이 메서드 밖에서 발생해 catch 가 돌지 않는다.
        // afterCompletion 동기화는 그 경우(및 메서드 내 예외)까지 모두 잡는다. (리뷰 반영, #46)
        List<String> storedNames = new ArrayList<>();
        registerRollbackCleanup(storedNames);

        List<PhotoResponse> responses = new ArrayList<>(targets.size());
        for (int i = 0; i < targets.size(); i++) {
            MultipartFile file = targets.get(i);
            // EXIF 는 store() *전에* 읽는다. store() 의 transferTo() 가 내부 임시파일을 옮기면
            // 그 뒤 getInputStream() 이 비어버릴 수 있다(스트림 소비 순서, #36 설계 검토).
            ExifData exif = extractExif(file);
            String storedName = photoStorage.store(file, extensions.get(i));
            storedNames.add(storedName);

            Photo photo = new Photo();
            photo.setUserId(userId);
            photo.setOriginalFilename(safeOriginalName(file.getOriginalFilename()));
            photo.setStoredFilename(storedName);
            photo.setContentType(file.getContentType());
            photo.setSizeBytes(file.getSize());
            photo.setTakenAt(exif.takenAt());
            photo.setLatitude(exif.latitude());
            photo.setLongitude(exif.longitude());
            photoMapper.insert(photo);
            // 윤곽선 전처리 대기 행 생성(PENDING). 추론 서버 호출은 업로드와 분리된 백그라운드 워커가 한다.
            photoOutlineMapper.insertPending(photo.getId());

            responses.add(PhotoResponse.from(photoMapper.findById(photo.getId())));
        }
        return responses;
    }

    /** 사진을 여행에 연결(이미 연결돼 있으면 이동). 내 사진을 내 여행에만 연결할 수 있다. */
    @Transactional
    public PhotoResponse linkToTrip(Long userId, Long photoId, Long tripId) {
        Photo photo = requireOwnedPhoto(userId, photoId);
        requireOwnedTrip(userId, tripId);
        photoMapper.updateTripId(photo.getId(), tripId);
        return PhotoResponse.from(photoMapper.findById(photo.getId()));
    }

    /** 사진의 여행 연결을 해제(trip_id = null). 사진은 삭제하지 않는다. */
    @Transactional
    public PhotoResponse unlinkFromTrip(Long userId, Long photoId) {
        Photo photo = requireOwnedPhoto(userId, photoId);
        photoMapper.updateTripId(photo.getId(), null);
        return PhotoResponse.from(photoMapper.findById(photo.getId()));
    }

    /** 여행에 연결된 사진 목록. 내 여행만 조회할 수 있다. */
    @Transactional(readOnly = true)
    public List<PhotoResponse> listByTrip(Long userId, Long tripId) {
        requireOwnedTrip(userId, tripId);
        return photoMapper.findByTripId(tripId).stream().map(PhotoResponse::from).toList();
    }

    /** 본인 사진의 원본을 서빙용으로 읽어 돌려준다(소유자만, S2-LOG-04 #38). */
    @Transactional(readOnly = true)
    public PhotoContent loadOwnedContent(Long userId, Long photoId) {
        Photo photo = requireOwnedPhoto(userId, photoId);
        // 원본 bytes 를 그대로 서빙한다 → 파일에 박힌 EXIF(GPS 등)도 포함된다(#38 검토).
        // 업로더 본인에게만 노출되므로 현재는 무관. 단 원본 사진을 남과 공유하는 기능이 생기면
        // 여기서 EXIF 스트립이 필요하다(현재는 소유자만 접근하므로 미적용).
        Resource resource = photoStorage.load(photo.getStoredFilename());
        return new PhotoContent(resource, photo.getContentType(), photo.getStoredFilename());
    }

    /** 사진의 윤곽선 전처리 상태/결과 조회(소유자만). 추론 전이면 PENDING, items 는 READY 일 때만. */
    @Transactional(readOnly = true)
    public PhotoOutlineResponse getOutline(Long userId, Long photoId) {
        requireOwnedPhoto(userId, photoId);
        PhotoOutline outline = photoOutlineMapper.findByPhotoId(photoId);
        if (outline == null) {
            // 이 기능 도입(V12) 전 업로드된 사진 등 — 아직 전처리 대상 행이 없음.
            return new PhotoOutlineResponse(photoId, OutlineStatus.PENDING, null);
        }
        return new PhotoOutlineResponse(photoId, outline.getStatus(), parseItems(outline.getItems()));
    }

    // items JSON 원문 → JsonNode(응답에 그대로 JSON 으로 실리도록). 깨졌으면 null.
    private JsonNode parseItems(String items) {
        if (items == null) {
            return null;
        }
        try {
            return objectMapper.readTree(items);
        } catch (JsonProcessingException e) {
            return null;
        }
    }

    // 사진 소유권 확인. 없으면 NOT_FOUND, 남의 사진이면 ACCESS_DENIED.
    private Photo requireOwnedPhoto(Long userId, Long photoId) {
        validateUserId(userId);
        if (photoId == null) {
            throw new BusinessException(ErrorCode.PHOTO_NOT_FOUND);
        }
        Photo photo = photoMapper.findById(photoId);
        if (photo == null) {
            throw new BusinessException(ErrorCode.PHOTO_NOT_FOUND);
        }
        if (!userId.equals(photo.getUserId())) {
            throw new BusinessException(ErrorCode.PHOTO_ACCESS_DENIED);
        }
        return photo;
    }

    // 여행 소유권 확인(연결/조회용). TripService 를 거치지 않고 TripMapper 만 재사용해 순환 의존을 피한다.
    private void requireOwnedTrip(Long userId, Long tripId) {
        if (tripId == null) {
            throw new BusinessException(ErrorCode.TRIP_NOT_FOUND);
        }
        Trip trip = tripMapper.findById(tripId);
        if (trip == null) {
            throw new BusinessException(ErrorCode.TRIP_NOT_FOUND);
        }
        if (!userId.equals(trip.getUserId())) {
            throw new BusinessException(ErrorCode.TRIP_ACCESS_DENIED);
        }
    }

    // 트랜잭션이 롤백되면(메서드 내 예외 또는 commit 실패) 이미 저장한 파일을 정리한다.
    private void registerRollbackCleanup(List<String> storedNames) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    storedNames.forEach(photoStorage::delete);
                }
            }
        });
    }

    private List<MultipartFile> nonEmpty(List<MultipartFile> files) {
        if (files == null) {
            throw new BusinessException(ErrorCode.PHOTO_NO_FILES);
        }
        List<MultipartFile> targets = files.stream()
                .filter(file -> file != null && !file.isEmpty())
                .toList();
        if (targets.isEmpty()) {
            throw new BusinessException(ErrorCode.PHOTO_NO_FILES);
        }
        return targets;
    }

    // EXIF 추출은 업로드를 막지 않는다 — 스트림을 못 열어도 빈 결과로 진행한다(#36).
    private ExifData extractExif(MultipartFile file) {
        try (InputStream in = file.getInputStream()) {
            return exifExtractor.extract(in);
        } catch (IOException e) {
            return ExifData.empty();
        }
    }

    private String resolveExtension(MultipartFile file) {
        String contentType = file.getContentType();
        String extension = ALLOWED_TYPES.get(contentType == null ? "" : contentType.toLowerCase());
        if (extension == null) {
            throw new BusinessException(ErrorCode.PHOTO_UNSUPPORTED_TYPE);
        }
        return extension;
    }

    private String safeOriginalName(String original) {
        if (!StringUtils.hasText(original)) {
            return FALLBACK_NAME;
        }
        // 경로 구분자 제거(방어적 — 저장 경로엔 안 쓰지만 메타도 정리해 둔다).
        String filename = StringUtils.getFilename(original);
        return StringUtils.hasText(filename) ? filename : FALLBACK_NAME;
    }

    private void validateUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
    }
}
