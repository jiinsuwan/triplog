package com.triplog.trip.controller;

import com.triplog.common.ApiResponse;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.trip.dto.CreateTripRequest;
import com.triplog.trip.dto.TripListResponse;
import com.triplog.trip.dto.TripResponse;
import com.triplog.trip.dto.UpdateTripRequest;
import com.triplog.trip.service.TripService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Trip", description = "Trip CRUD API")
@RestController
@RequestMapping("/trips")
public class TripController {

    private final TripService tripService;

    public TripController(TripService tripService) {
        this.tripService = tripService;
    }

    @Operation(summary = "Create trip")
    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<TripResponse> create(@AuthenticationPrincipal Object principal,
                                            @Valid @RequestBody CreateTripRequest request) {
        return ApiResponse.success("Trip created.", tripService.create(resolveUserId(principal), request));
    }

    @Operation(summary = "List my trips")
    @GetMapping
    public ApiResponse<TripListResponse> list(@AuthenticationPrincipal Object principal,
                                              @RequestParam(required = false) Integer page,
                                              @RequestParam(required = false) Integer size) {
        return ApiResponse.success(tripService.list(resolveUserId(principal), page, size));
    }

    @Operation(summary = "Get trip detail")
    @GetMapping("/{id}")
    public ApiResponse<TripResponse> get(@AuthenticationPrincipal Object principal,
                                         @PathVariable Long id) {
        return ApiResponse.success(tripService.get(resolveUserId(principal), id));
    }

    @Operation(summary = "Update trip")
    @PutMapping("/{id}")
    public ApiResponse<TripResponse> update(@AuthenticationPrincipal Object principal,
                                            @PathVariable Long id,
                                            @Valid @RequestBody UpdateTripRequest request) {
        return ApiResponse.success("Trip updated.", tripService.update(resolveUserId(principal), id, request));
    }

    @Operation(summary = "Delete trip")
    @DeleteMapping("/{id}")
    public ApiResponse<Void> delete(@AuthenticationPrincipal Object principal,
                                    @PathVariable Long id) {
        tripService.delete(resolveUserId(principal), id);
        return ApiResponse.success("Trip deleted.", null);
    }

    private Long resolveUserId(Object principal) {
        if (principal instanceof Long userId) {
            return userId;
        }
        if (principal instanceof Number number) {
            return number.longValue();
        }
        if (principal instanceof String subject) {
            return parseUserId(subject);
        }
        if (principal instanceof UserDetails userDetails) {
            return parseUserId(userDetails.getUsername());
        }
        throw new BusinessException(ErrorCode.UNAUTHORIZED);
    }

    private Long parseUserId(String value) {
        try {
            return Long.valueOf(value);
        } catch (NumberFormatException e) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
    }
}
