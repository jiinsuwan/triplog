package com.triplog.photo.storage;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

/**
 * 사진을 로컬 디스크(UPLOAD_DIR)에 저장한다. (architecture §A2 — S3·저장소 추상화 미사용)
 *
 * 디스크 저장명 = 서버가 생성한 UUID + 확장자. 사용자 원본 파일명을 경로에 쓰지 않으므로
 * 경로 조작(../)을 원천 차단한다. 추가로 resolve 결과가 root 밖이면 거부한다(방어).
 */
@Component
public class PhotoStorage {

    private final Path root;

    public PhotoStorage(@Value("${app.upload-dir}") String uploadDir) {
        this.root = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    /** 파일을 저장하고 디스크 저장명을 반환한다. */
    public String store(MultipartFile file, String extension) {
        try {
            Files.createDirectories(root);
            String storedName = UUID.randomUUID() + extension;
            Path target = root.resolve(storedName).normalize();
            if (!target.startsWith(root)) {
                throw new BusinessException(ErrorCode.PHOTO_STORAGE_FAILED);
            }
            file.transferTo(target);
            return storedName;
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.PHOTO_STORAGE_FAILED);
        }
    }

    /** 저장 도중 실패 시 이미 쓴 파일을 정리한다(고아 파일 방지, best-effort). */
    public void delete(String storedName) {
        try {
            Files.deleteIfExists(root.resolve(storedName).normalize());
        } catch (IOException ignored) {
            // best-effort: 정리 실패는 업로드 자체를 막지 않는다.
        }
    }
}
