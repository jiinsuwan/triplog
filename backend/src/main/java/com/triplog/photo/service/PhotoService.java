package com.triplog.photo.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.domain.Photo;
import com.triplog.photo.dto.PhotoResponse;
import com.triplog.photo.mapper.PhotoMapper;
import com.triplog.photo.storage.PhotoStorage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

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
    private final PhotoStorage photoStorage;

    public PhotoService(PhotoMapper photoMapper, PhotoStorage photoStorage) {
        this.photoMapper = photoMapper;
        this.photoStorage = photoStorage;
    }

    @Transactional
    public List<PhotoResponse> upload(Long userId, List<MultipartFile> files) {
        validateUserId(userId);
        List<MultipartFile> targets = nonEmpty(files);

        // 1차: 전부 형식 검증. 한 장이라도 invalid 면 디스크에 아무것도 쓰지 않고 실패한다.
        targets.forEach(this::resolveExtension);

        // 2차: 저장 + 메타 기록. 도중 실패 시 이미 저장한 파일을 정리(고아 방지) 후 롤백.
        List<String> storedNames = new ArrayList<>();
        try {
            List<PhotoResponse> responses = new ArrayList<>(targets.size());
            for (MultipartFile file : targets) {
                String storedName = photoStorage.store(file, resolveExtension(file));
                storedNames.add(storedName);

                Photo photo = new Photo();
                photo.setUserId(userId);
                photo.setOriginalFilename(safeOriginalName(file.getOriginalFilename()));
                photo.setStoredFilename(storedName);
                photo.setContentType(file.getContentType());
                photo.setSizeBytes(file.getSize());
                photoMapper.insert(photo);

                responses.add(PhotoResponse.from(photoMapper.findById(photo.getId())));
            }
            return responses;
        } catch (RuntimeException e) {
            storedNames.forEach(photoStorage::delete);
            throw e;
        }
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
