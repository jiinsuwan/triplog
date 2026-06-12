package com.triplog.trip.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.service.PhotoTripCleanup;
import com.triplog.trip.domain.Trip;
import com.triplog.trip.domain.TripStatus;
import com.triplog.trip.dto.CreateTripRequest;
import com.triplog.trip.dto.TripListResponse;
import com.triplog.trip.dto.TripResponse;
import com.triplog.trip.dto.UpdateTripRequest;
import com.triplog.trip.mapper.TripMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDate;

@Service
public class TripService {

    private static final int DEFAULT_SIZE = 20;
    private static final int MAX_SIZE = 100;

    private final TripMapper tripMapper;
    private final PhotoTripCleanup photoTripCleanup;

    public TripService(TripMapper tripMapper, PhotoTripCleanup photoTripCleanup) {
        this.tripMapper = tripMapper;
        this.photoTripCleanup = photoTripCleanup;
    }

    @Transactional
    public TripResponse create(Long userId, CreateTripRequest request) {
        validateUserId(userId);
        validateTripFields(request.title(), request.startDate(), request.endDate(),
                request.region(), request.theme(), request.status());

        Trip trip = new Trip();
        trip.setUserId(userId);
        apply(trip, request.title(), request.startDate(), request.endDate(),
                request.region(), request.theme(), request.status());
        tripMapper.insert(trip);
        return TripResponse.from(tripMapper.findById(trip.getId()));
    }

    @Transactional(readOnly = true)
    public TripListResponse list(Long userId, Integer page, Integer size) {
        validateUserId(userId);
        int normalizedPage = normalizePage(page);
        int normalizedSize = normalizeSize(size);
        int offset = normalizedPage * normalizedSize;

        var items = tripMapper.findByUserId(userId, normalizedSize, offset).stream()
                .map(TripResponse::from)
                .toList();
        long total = tripMapper.countByUserId(userId);
        return new TripListResponse(items, normalizedPage, normalizedSize, total);
    }

    @Transactional(readOnly = true)
    public TripResponse get(Long userId, Long tripId) {
        return TripResponse.from(requireOwnedTrip(userId, tripId));
    }

    @Transactional
    public TripResponse update(Long userId, Long tripId, UpdateTripRequest request) {
        validateTripFields(request.title(), request.startDate(), request.endDate(),
                request.region(), request.theme(), request.status());
        Trip trip = requireOwnedTrip(userId, tripId);
        apply(trip, request.title(), request.startDate(), request.endDate(),
                request.region(), request.theme(), request.status());
        tripMapper.update(trip);
        return TripResponse.from(tripMapper.findById(trip.getId()));
    }

    @Transactional
    public void delete(Long userId, Long tripId) {
        Trip trip = requireOwnedTrip(userId, tripId);
        // 연결된 사진 파일을 커밋 후 삭제하도록 예약(trips 삭제 전에 파일명 확보, #37 / S2-LOG-03).
        photoTripCleanup.scheduleFileCleanupForTrip(trip.getId());
        tripMapper.deleteById(trip.getId()); // FK ON DELETE CASCADE 로 photos row 동반 삭제
    }

    private Trip requireOwnedTrip(Long userId, Long tripId) {
        validateUserId(userId);
        if (tripId == null) {
            throw new BusinessException(ErrorCode.TRIP_INVALID_INPUT);
        }

        Trip trip = tripMapper.findById(tripId);
        if (trip == null) {
            throw new BusinessException(ErrorCode.TRIP_NOT_FOUND);
        }
        if (!userId.equals(trip.getUserId())) {
            throw new BusinessException(ErrorCode.TRIP_ACCESS_DENIED);
        }
        return trip;
    }

    private void apply(Trip trip, String title, LocalDate startDate, LocalDate endDate,
                       String region, String theme, String status) {
        trip.setTitle(title.trim());
        trip.setStartDate(startDate);
        trip.setEndDate(endDate);
        trip.setRegion(region.trim());
        trip.setTheme(theme.trim());
        trip.setStatus(canonicalStatus(status));
    }

    private void validateTripFields(String title, LocalDate startDate, LocalDate endDate,
                                    String region, String theme, String status) {
        if (!StringUtils.hasText(title)
                || startDate == null
                || endDate == null
                || !StringUtils.hasText(region)
                || !StringUtils.hasText(theme)
                || !StringUtils.hasText(status)
                || !TripStatus.isSupported(status)
                || endDate.isBefore(startDate)) {
            throw new BusinessException(ErrorCode.TRIP_INVALID_INPUT);
        }
    }

    private String canonicalStatus(String status) {
        return TripStatus.from(status)
                .map(TripStatus::value)
                .orElseThrow(() -> new BusinessException(ErrorCode.TRIP_INVALID_INPUT));
    }

    private void validateUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
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
