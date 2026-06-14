package com.triplog.itinerary.controller;

import com.triplog.common.ApiResponse;
import com.triplog.itinerary.dto.CreateItineraryStopRequest;
import com.triplog.itinerary.dto.ItineraryResponse;
import com.triplog.itinerary.dto.ItineraryStopResponse;
import com.triplog.itinerary.dto.ReorderItineraryStopsRequest;
import com.triplog.itinerary.dto.UpdateItineraryStopRequest;
import com.triplog.itinerary.service.ItineraryService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "Itinerary", description = "Trip itinerary stop API")
@RestController
@RequestMapping("/trips/{tripId}/itinerary")
public class ItineraryController {

    private final ItineraryService itineraryService;

    public ItineraryController(ItineraryService itineraryService) {
        this.itineraryService = itineraryService;
    }

    @Operation(summary = "Get trip itinerary")
    @GetMapping
    public ApiResponse<ItineraryResponse> get(@AuthenticationPrincipal Long userId,
                                              @PathVariable Long tripId) {
        return ApiResponse.success(itineraryService.get(userId, tripId));
    }

    @Operation(summary = "Create itinerary stop")
    @PostMapping("/days/{dayNumber}/stops")
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<ItineraryStopResponse> createStop(@AuthenticationPrincipal Long userId,
                                                         @PathVariable Long tripId,
                                                         @PathVariable Integer dayNumber,
                                                         @Valid @RequestBody CreateItineraryStopRequest request) {
        return ApiResponse.success("Itinerary stop created.",
                itineraryService.createStop(userId, tripId, dayNumber, request));
    }

    @Operation(summary = "Update itinerary stop")
    @PutMapping("/days/{dayNumber}/stops/{stopId}")
    public ApiResponse<ItineraryStopResponse> updateStop(@AuthenticationPrincipal Long userId,
                                                         @PathVariable Long tripId,
                                                         @PathVariable Integer dayNumber,
                                                         @PathVariable Long stopId,
                                                         @Valid @RequestBody UpdateItineraryStopRequest request) {
        return ApiResponse.success("Itinerary stop updated.",
                itineraryService.updateStop(userId, tripId, dayNumber, stopId, request));
    }

    @Operation(summary = "Delete itinerary stop")
    @DeleteMapping("/days/{dayNumber}/stops/{stopId}")
    public ApiResponse<Void> deleteStop(@AuthenticationPrincipal Long userId,
                                        @PathVariable Long tripId,
                                        @PathVariable Integer dayNumber,
                                        @PathVariable Long stopId) {
        itineraryService.deleteStop(userId, tripId, dayNumber, stopId);
        return ApiResponse.success("Itinerary stop deleted.", null);
    }

    @Operation(summary = "Reorder itinerary stops for a day")
    @PutMapping("/days/{dayNumber}/stops/order")
    public ApiResponse<ItineraryResponse> reorderStops(@AuthenticationPrincipal Long userId,
                                                       @PathVariable Long tripId,
                                                       @PathVariable Integer dayNumber,
                                                       @Valid @RequestBody ReorderItineraryStopsRequest request) {
        return ApiResponse.success("Itinerary stops reordered.",
                itineraryService.reorderStops(userId, tripId, dayNumber, request));
    }
}
