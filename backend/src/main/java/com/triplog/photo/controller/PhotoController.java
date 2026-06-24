package com.triplog.photo.controller;

import com.triplog.common.ApiResponse;
import com.triplog.photo.dto.LinkPhotoTripRequest;
import com.triplog.photo.dto.PhotoContent;
import com.triplog.photo.dto.PhotoResponse;
import com.triplog.photo.outline.BoxRequest;
import com.triplog.photo.outline.OutlineCorrectionResponse;
import com.triplog.photo.outline.OutlineCorrectionService;
import com.triplog.photo.outline.PhotoOutlineResponse;
import com.triplog.photo.outline.RefineRequest;
import com.triplog.photo.outline.TapRequest;
import com.triplog.photo.service.PhotoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Tag(name = "Photo", description = "Photo upload API")
@RestController
@RequestMapping("/photos")
public class PhotoController {

    private final PhotoService photoService;
    private final OutlineCorrectionService outlineCorrectionService;

    public PhotoController(PhotoService photoService, OutlineCorrectionService outlineCorrectionService) {
        this.photoService = photoService;
        this.outlineCorrectionService = outlineCorrectionService;
    }

    @Operation(summary = "Upload photos (multiple)")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<List<PhotoResponse>> upload(
            @AuthenticationPrincipal Long userId,
            @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        return ApiResponse.success("Photos uploaded.", photoService.upload(userId, files));
    }

    @Operation(summary = "Link a photo to a trip (or move)")
    @PatchMapping("/{photoId}/trip")
    public ApiResponse<PhotoResponse> linkToTrip(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long photoId,
            @RequestBody LinkPhotoTripRequest request) {
        return ApiResponse.success("Photo linked to trip.",
                photoService.linkToTrip(userId, photoId, request.tripId()));
    }

    @Operation(summary = "Unlink a photo from its trip")
    @DeleteMapping("/{photoId}/trip")
    public ApiResponse<PhotoResponse> unlinkFromTrip(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long photoId) {
        return ApiResponse.success("Photo unlinked from trip.",
                photoService.unlinkFromTrip(userId, photoId));
    }

    @Operation(summary = "List photos linked to a trip")
    @GetMapping(params = "tripId")
    public ApiResponse<List<PhotoResponse>> listByTrip(
            @AuthenticationPrincipal Long userId,
            @RequestParam Long tripId) {
        return ApiResponse.success("Trip photos.", photoService.listByTrip(userId, tripId));
    }

    @Operation(summary = "Serve a photo's original image (owner only)")
    @GetMapping("/{photoId}/content")
    public ResponseEntity<Resource> content(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long photoId) {
        PhotoContent photo = photoService.loadOwnedContent(userId, photoId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(photo.contentType()))
                // 소유자 전용 민감 이미지 → 캐시 금지. private max-age 캐시는 로그아웃·계정전환 후에도
                // 브라우저 캐시에서 재검증 없이 노출돼 인증을 우회할 수 있다.
                .cacheControl(CacheControl.noStore())
                .body(photo.resource());
    }

    @Operation(summary = "Get a photo's outline preprocess status/result (owner only)")
    @GetMapping("/{photoId}/outline")
    public ApiResponse<PhotoOutlineResponse> outline(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long photoId) {
        return ApiResponse.success("Photo outline.", photoService.getOutline(userId, photoId));
    }

    @Operation(summary = "Tap-correct an outline: add a single object (owner only)")
    @PostMapping("/{photoId}/outline/tap")
    public ApiResponse<OutlineCorrectionResponse> tapOutline(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long photoId,
            @RequestBody TapRequest request) {
        return ApiResponse.success("Outline tap applied.",
                outlineCorrectionService.tap(userId, photoId, request.point()));
    }

    @Operation(summary = "Box-correct an outline: add a grouped object (owner only)")
    @PostMapping("/{photoId}/outline/box")
    public ApiResponse<OutlineCorrectionResponse> boxOutline(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long photoId,
            @RequestBody BoxRequest request) {
        return ApiResponse.success("Outline box applied.",
                outlineCorrectionService.box(userId, photoId, request.box()));
    }

    @Operation(summary = "Refine an outline with +/- points (owner only)")
    @PostMapping("/{photoId}/outline/refine")
    public ApiResponse<OutlineCorrectionResponse> refineOutline(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long photoId,
            @RequestBody RefineRequest request) {
        return ApiResponse.success("Outline refine applied.",
                outlineCorrectionService.refine(userId, photoId, request.itemId(), request.pos(), request.neg()));
    }

    @Operation(summary = "Delete an outline item (owner only)")
    @DeleteMapping("/{photoId}/outline/items/{itemId}")
    public ApiResponse<Void> deleteOutlineItem(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long photoId,
            @PathVariable int itemId) {
        outlineCorrectionService.deleteItem(userId, photoId, itemId);
        return ApiResponse.success("Outline item deleted.", null);
    }
}
