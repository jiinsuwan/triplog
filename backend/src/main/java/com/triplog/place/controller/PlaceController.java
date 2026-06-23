package com.triplog.place.controller;

import com.triplog.common.ApiResponse;
import com.triplog.place.dto.PlaceDetailResponse;
import com.triplog.place.dto.PlaceListResponse;
import com.triplog.place.dto.PlaceRegionResponse;
import com.triplog.place.service.PlaceService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "Place", description = "Public place catalog API")
@RestController
@RequestMapping("/places")
public class PlaceController {

    private final PlaceService placeService;

    public PlaceController(PlaceService placeService) {
        this.placeService = placeService;
    }

    @Operation(summary = "List places")
    @GetMapping
    public ApiResponse<PlaceListResponse> list(@RequestParam(required = false) String region1,
                                               @RequestParam(required = false) String region2,
                                               @Parameter(description = "Content type code. Examples: ATTRACTION, LODGING, CULTURE, EVENT, TRAVEL_COURSE, SHOPPING, RESTAURANT. Defaults to the public tourist catalog when omitted.")
                                               @RequestParam(required = false) String placeType,
                                               @RequestParam(required = false) String category,
                                               @RequestParam(required = false) String keyword,
                                               @RequestParam(required = false) Integer page,
                                               @RequestParam(required = false) Integer size) {
        return ApiResponse.success(placeService.list(region1, region2, placeType, category, keyword, page, size));
    }

    @Operation(summary = "Get place detail")
    @GetMapping("/{id}")
    public ApiResponse<PlaceDetailResponse> get(@PathVariable Long id) {
        return ApiResponse.success(placeService.get(id));
    }

    @Operation(summary = "List place regions")
    @GetMapping("/regions")
    public ApiResponse<List<PlaceRegionResponse>> regions() {
        return ApiResponse.success(placeService.regions());
    }

    @Operation(summary = "List place categories")
    @GetMapping("/categories")
    public ApiResponse<List<String>> categories() {
        return ApiResponse.success(placeService.categories());
    }
}
