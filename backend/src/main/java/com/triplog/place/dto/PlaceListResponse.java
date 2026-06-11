package com.triplog.place.dto;

import java.util.List;

public record PlaceListResponse(List<PlaceResponse> items, int page, long total) {
}
