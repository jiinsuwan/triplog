package com.triplog.photo.dto;

import org.springframework.core.io.Resource;

/**
 * 사진 원본 서빙용 묶음(S2-LOG-04 #38): 파일 Resource + 검증된 content-type + ETag 식별자.
 * storedFilename 은 UUID 기반 불변값이라 ETag 로 적합하다.
 */
public record PhotoContent(Resource resource, String contentType, String storedFilename) {
}
