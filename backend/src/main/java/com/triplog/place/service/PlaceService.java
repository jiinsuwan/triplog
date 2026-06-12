package com.triplog.place.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.place.dto.PlaceDetailResponse;
import com.triplog.place.dto.PlaceListResponse;
import com.triplog.place.dto.PlaceRegionResponse;
import com.triplog.place.dto.PlaceResponse;
import com.triplog.place.mapper.PlaceMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.List;

@Service
public class PlaceService {

    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;

    private final PlaceMapper placeMapper;

    public PlaceService(PlaceMapper placeMapper) {
        this.placeMapper = placeMapper;
    }

    @Transactional(readOnly = true)
    public PlaceListResponse list(String region1, String region2, String category,
                                  String keyword, Integer page, Integer size) {
        int normalizedPage = normalizePage(page);
        int normalizedSize = normalizeSize(size);
        int offset = normalizedPage * normalizedSize;

        String normalizedRegion1 = normalizeText(region1);
        String normalizedRegion2 = normalizeText(region2);
        String normalizedCategory = normalizeText(category);
        String normalizedKeyword = normalizeText(keyword);

        var items = placeMapper.find(normalizedRegion1, normalizedRegion2, normalizedCategory,
                        normalizedKeyword, normalizedSize, offset).stream()
                .map(PlaceResponse::from)
                .toList();
        long total = placeMapper.count(normalizedRegion1, normalizedRegion2, normalizedCategory, normalizedKeyword);
        return new PlaceListResponse(items, normalizedPage, total);
    }

    @Transactional(readOnly = true)
    public List<PlaceRegionResponse> regions() {
        return placeMapper.findRegions().stream()
                .map(PlaceRegionResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<String> categories() {
        return placeMapper.findCategories();
    }

    @Transactional(readOnly = true)
    public PlaceDetailResponse get(Long id) {
        if (id == null || id <= 0) {
            throw new BusinessException(ErrorCode.PLACE_NOT_FOUND);
        }
        var place = placeMapper.findById(id);
        if (place == null) {
            throw new BusinessException(ErrorCode.PLACE_NOT_FOUND);
        }
        return PlaceDetailResponse.from(place);
    }

    private String normalizeText(String value) {
        if (!StringUtils.hasText(value)) {
            return null;
        }
        return value.trim();
    }

    private int normalizePage(Integer page) {
        if (page == null || page < 0) {
            return 0;
        }
        return page;
    }

    private int normalizeSize(Integer size) {
        if (size == null || size < 1) {
            return DEFAULT_SIZE;
        }
        return Math.min(size, MAX_SIZE);
    }
}
