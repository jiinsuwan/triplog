package com.triplog.itinerary.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@Schema(description = "일정 stop 수정 요청")
public record UpdateItineraryStopRequest(
        @Schema(description = "선택 시각. HH:mm 형식, 선택값", example = "13:00")
        String selectedTime,

        @Schema(description = "메모", example = "점심 후 이동")
        @Size(max = 500, message = "memo must be 500 characters or less")
        String memo,

        @Schema(description = "이 stop으로 이동할 때 사용한 이동수단", allowableValues = {
                "walk", "car", "public_transit", "other"
        }, example = "public_transit")
        @NotBlank(message = "transport is required")
        String transport
) {
}
