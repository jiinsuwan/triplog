package com.triplog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

@Schema(description = "일정 stop 생성 요청")
public record CreateItineraryStopRequest(
        @Schema(description = "선택 시각. HH:mm 형식, 선택값", example = "10:30")
        String selectedTime,

        @Schema(description = "메모", example = "오픈 직후 방문")
        @Size(max = 500, message = "memo must be 500 characters or less")
        String memo,

        @Schema(description = "이 stop으로 이동할 때 사용한 이동수단", allowableValues = {
                "walk", "car", "public_transit", "other"
        }, example = "walk")
        @NotBlank(message = "transport is required")
        String transport,

        @Schema(description = "일정에 담을 장소 snapshot")
        @Valid
        @NotNull(message = "place is required")
        ItineraryPlaceRequest place
) {
}
