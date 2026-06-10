package com.triplog.photo.controller;

import com.triplog.common.ApiResponse;
import com.triplog.photo.dto.PhotoResponse;
import com.triplog.photo.service.PhotoService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.PostMapping;
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

    public PhotoController(PhotoService photoService) {
        this.photoService = photoService;
    }

    @Operation(summary = "Upload photos (multiple)")
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<List<PhotoResponse>> upload(
            @AuthenticationPrincipal Long userId,
            @RequestParam(value = "files", required = false) List<MultipartFile> files) {
        return ApiResponse.success("Photos uploaded.", photoService.upload(userId, files));
    }
}
