package com.triplog.photo.dto;

/** 사진을 여행에 연결하는 요청(S2-LOG-03 #37). tripId = 연결 대상 여행. */
public record LinkPhotoTripRequest(Long tripId) {
}
