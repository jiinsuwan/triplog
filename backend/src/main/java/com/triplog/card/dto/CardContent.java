package com.triplog.card.dto;

import org.springframework.core.io.Resource;

/** 완성 카드 PNG 서빙용 묶음. */
public record CardContent(Resource resource, String contentType, String storedFilename) {
}
