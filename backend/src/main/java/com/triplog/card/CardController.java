package com.triplog.card;

import com.triplog.card.dto.CardContent;
import com.triplog.card.dto.CardResponse;
import com.triplog.card.dto.MemorySummaryResponse;
import com.triplog.card.service.CardService;
import com.triplog.common.ApiResponse;
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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

@Tag(name = "Card", description = "Saved memory card API")
@RestController
public class CardController {

    private final CardService cardService;

    public CardController(CardService cardService) {
        this.cardService = cardService;
    }

    @Operation(summary = "Save a completed card PNG into a trip memory")
    @PostMapping(value = "/trips/{tripId}/cards", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public ApiResponse<CardResponse> save(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long tripId,
            @RequestParam Long photoId,
            @RequestParam("file") MultipartFile file) {
        return ApiResponse.success("Card saved.", cardService.save(userId, tripId, photoId, file));
    }

    @Operation(summary = "List saved cards in a trip memory")
    @GetMapping("/trips/{tripId}/cards")
    public ApiResponse<List<CardResponse>> listByTrip(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long tripId) {
        return ApiResponse.success("Trip cards.", cardService.listByTrip(userId, tripId));
    }

    @Operation(summary = "List my memories for LOGS")
    @GetMapping("/memories")
    public ApiResponse<List<MemorySummaryResponse>> memories(@AuthenticationPrincipal Long userId) {
        return ApiResponse.success("Memories.", cardService.listMemories(userId));
    }

    @Operation(summary = "Serve a saved card PNG (owner only)")
    @GetMapping("/cards/{cardId}/image")
    public ResponseEntity<Resource> image(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long cardId) {
        CardContent card = cardService.loadOwnedImage(userId, cardId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(card.contentType()))
                .cacheControl(CacheControl.noStore())
                .body(card.resource());
    }

    @Operation(summary = "Delete a saved card from a memory")
    @DeleteMapping("/cards/{cardId}")
    public ApiResponse<Void> delete(
            @AuthenticationPrincipal Long userId,
            @PathVariable Long cardId) {
        cardService.delete(userId, cardId);
        return ApiResponse.success("Card deleted.", null);
    }
}
