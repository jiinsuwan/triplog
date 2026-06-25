package com.triplog.trip.service;

import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.card.service.CardFileCleanup;
import com.triplog.photo.service.PhotoTripCleanup;
import com.triplog.trip.domain.Trip;
import com.triplog.trip.dto.CreateTripRequest;
import com.triplog.trip.dto.UpdateTripRequest;
import com.triplog.trip.mapper.TripMapper;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TripServiceTest {

    @Mock
    private TripMapper tripMapper;
    @Mock
    private PhotoTripCleanup photoTripCleanup;
    @Mock
    private CardFileCleanup cardFileCleanup;

    private TripService tripService;

    @BeforeEach
    void setUp() {
        tripService = new TripService(tripMapper, photoTripCleanup, cardFileCleanup);
    }

    @Test
    void create_rejects_blank_required_fields() {
        CreateTripRequest request = new CreateTripRequest(
                " ", LocalDate.of(2026, 6, 10), LocalDate.of(2026, 6, 12),
                "Seoul", "food", "planning");

        assertThatThrownBy(() -> tripService.create(1L, request))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TRIP_INVALID_INPUT));

        verify(tripMapper, never()).insert(any());
    }

    @Test
    void create_rejects_end_date_before_start_date() {
        CreateTripRequest request = new CreateTripRequest(
                "Seoul trip", LocalDate.of(2026, 6, 12), LocalDate.of(2026, 6, 10),
                "Seoul", "food", "planning");

        assertThatThrownBy(() -> tripService.create(1L, request))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TRIP_INVALID_INPUT));

        verify(tripMapper, never()).insert(any());
    }

    @Test
    void create_rejects_unsupported_status() {
        CreateTripRequest request = new CreateTripRequest(
                "Seoul trip", LocalDate.of(2026, 6, 10), LocalDate.of(2026, 6, 12),
                "Seoul", "food", "PLANNED");

        assertThatThrownBy(() -> tripService.create(1L, request))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TRIP_INVALID_INPUT));

        verify(tripMapper, never()).insert(any());
    }

    @Test
    void update_rejects_unsupported_status() {
        UpdateTripRequest request = new UpdateTripRequest(
                "Seoul trip", LocalDate.of(2026, 6, 10), LocalDate.of(2026, 6, 12),
                "Seoul", "food", "PLANNED");

        assertThatThrownBy(() -> tripService.update(1L, 10L, request))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TRIP_INVALID_INPUT));

        verify(tripMapper, never()).update(any());
    }

    @Test
    void get_rejects_other_user_trip() {
        Trip trip = trip(10L, 2L);
        when(tripMapper.findById(10L)).thenReturn(trip);

        assertThatThrownBy(() -> tripService.get(1L, 10L))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TRIP_ACCESS_DENIED));
    }

    @Test
    void delete_rejects_missing_trip() {
        when(tripMapper.findById(10L)).thenReturn(null);

        assertThatThrownBy(() -> tripService.delete(1L, 10L))
                .isInstanceOfSatisfying(BusinessException.class, e ->
                        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.TRIP_NOT_FOUND));

        verify(tripMapper, never()).deleteById(any());
    }

    private Trip trip(Long id, Long userId) {
        Trip trip = new Trip();
        trip.setId(id);
        trip.setUserId(userId);
        trip.setTitle("Seoul trip");
        trip.setStartDate(LocalDate.of(2026, 6, 10));
        trip.setEndDate(LocalDate.of(2026, 6, 12));
        trip.setRegion("Seoul");
        trip.setTheme("food");
        trip.setStatus("planning");
        return trip;
    }
}
