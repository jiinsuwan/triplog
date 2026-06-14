package com.triplog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;

import java.math.BigDecimal;

@Schema(description = "장소 snapshot 입력. DB source는 dbPlaceId만 필요하고, Kakao source는 snapshot 필드가 필요합니다.")
public record ItineraryPlaceRequest(
        @Schema(description = "장소 출처", allowableValues = {"DB", "KAKAO"}, example = "KAKAO")
        @NotBlank(message = "source is required")
        String source,

        @Schema(description = "places.id. source=DB일 때 필수", example = "11")
        Long dbPlaceId,

        @Schema(description = "외부 원본 장소 id. Kakao place id 또는 DB 원본 source_id", example = "27557389")
        String sourcePlaceId,

        @Schema(description = "장소 유형", example = "RESTAURANT")
        String placeType,

        @Schema(description = "장소명", example = "전주맛집")
        String name,

        @Schema(description = "상세 카테고리", example = "음식점 > 한식")
        String category,

        @Schema(description = "대표 카테고리 그룹", example = "음식점")
        String categoryGroup,

        @Schema(description = "시/도", example = "전라북도")
        String region1,

        @Schema(description = "시/군/구", example = "전주시")
        String region2,

        @Schema(description = "지번 주소")
        String address,

        @Schema(description = "도로명 주소")
        String roadAddress,

        @Schema(description = "위도", example = "35.81500000")
        BigDecimal latitude,

        @Schema(description = "경도", example = "127.15300000")
        BigDecimal longitude,

        @Schema(description = "전화번호")
        String phone,

        @Schema(description = "외부 장소 URL")
        String placeUrl
) {
}
