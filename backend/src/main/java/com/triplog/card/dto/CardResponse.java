package com.triplog.card.dto;

import com.triplog.card.domain.Card;

import java.time.LocalDateTime;

public record CardResponse(
        Long id,
        Long userId,
        Long tripId,
        Long photoId,
        String contentType,
        long sizeBytes,
        int width,
        int height,
        LocalDateTime createdAt,
        LocalDateTime updatedAt,
        String imageUrl) {

    public static CardResponse from(Card card) {
        return new CardResponse(
                card.getId(),
                card.getUserId(),
                card.getTripId(),
                card.getPhotoId(),
                card.getContentType(),
                card.getSizeBytes(),
                card.getWidth(),
                card.getHeight(),
                card.getCreatedAt(),
                card.getUpdatedAt(),
                "/cards/" + card.getId() + "/image");
    }
}
