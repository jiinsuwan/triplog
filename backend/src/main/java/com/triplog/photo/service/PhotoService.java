package com.triplog.photo.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.domain.Photo;
import com.triplog.photo.dto.PhotoResponse;
import com.triplog.photo.mapper.PhotoMapper;
import com.triplog.photo.storage.PhotoStorage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
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
            String storedName = photoStorage.store(file, extensions.get(i));
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
