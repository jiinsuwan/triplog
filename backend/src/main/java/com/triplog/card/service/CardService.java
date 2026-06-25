package com.triplog.card.service;

import com.triplog.card.domain.Card;
import com.triplog.card.dto.CardContent;
import com.triplog.card.dto.CardResponse;
import com.triplog.card.dto.MemorySummaryResponse;
import com.triplog.card.mapper.CardMapper;
import com.triplog.common.BusinessException;
import com.triplog.common.ErrorCode;
import com.triplog.photo.domain.Photo;
import com.triplog.photo.mapper.PhotoMapper;
import com.triplog.photo.storage.PhotoStorage;
import com.triplog.trip.domain.Trip;
import com.triplog.trip.mapper.TripMapper;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;
import java.io.IOException;
import java.io.InputStream;
import java.util.List;

@Service
public class CardService {

    private static final String PNG_CONTENT_TYPE = "image/png";
    private static final String PNG_EXTENSION = ".png";

    private final CardMapper cardMapper;
    private final TripMapper tripMapper;
    private final PhotoMapper photoMapper;
    private final PhotoStorage photoStorage;

    public CardService(CardMapper cardMapper, TripMapper tripMapper,
                       PhotoMapper photoMapper, PhotoStorage photoStorage) {
        this.cardMapper = cardMapper;
        this.tripMapper = tripMapper;
        this.photoMapper = photoMapper;
        this.photoStorage = photoStorage;
    }

    /**
     * 한 추억(여행) 안에서 사진 1장당 완성 카드 1장만 유지한다.
     * 같은 tripId/photoId 로 다시 저장하면 기존 PNG 를 새 PNG 로 교체한다.
     */
    @Transactional
    public CardResponse save(Long userId, Long tripId, Long photoId, MultipartFile file) {
        validateUserId(userId);
        requireOwnedTrip(userId, tripId);
        Photo photo = requireOwnedPhoto(userId, photoId);
        if (!tripId.equals(photo.getTripId())) {
            throw new BusinessException(ErrorCode.CARD_INVALID_INPUT,
                    "이 여행에 연결된 사진만 카드로 저장할 수 있습니다.");
        }
        ImageSize imageSize = validatePng(file);

        Card existing = cardMapper.findByTripAndPhotoForUpdate(tripId, photoId);
        // existing 은 아래 card 와 같은 객체라, 새 파일명으로 덮어쓰기 전에 옛 파일명을 먼저 캡처한다.
        String oldStoredName = existing == null ? null : existing.getStoredFilename();
        String newStoredName = photoStorage.store(file, PNG_EXTENSION);
        registerRollbackCleanup(newStoredName);

        Card card = existing == null ? new Card() : existing;
        card.setUserId(userId);
        card.setTripId(tripId);
        card.setPhotoId(photoId);
        card.setStoredFilename(newStoredName);
        card.setContentType(PNG_CONTENT_TYPE);
        card.setSizeBytes(file.getSize());
        card.setWidth(imageSize.width());
        card.setHeight(imageSize.height());

        if (existing == null) {
            cardMapper.insert(card);
        } else {
            cardMapper.update(card);
            scheduleAfterCommitDelete(oldStoredName);
        }
        return CardResponse.from(cardMapper.findById(card.getId()));
    }

    @Transactional(readOnly = true)
    public List<CardResponse> listByTrip(Long userId, Long tripId) {
        requireOwnedTrip(userId, tripId);
        return cardMapper.findByTripId(tripId).stream()
                .map(CardResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public List<MemorySummaryResponse> listMemories(Long userId) {
        validateUserId(userId);
        return cardMapper.findMemorySummariesByUser(userId).stream()
                .map(MemorySummaryResponse::from)
                .toList();
    }

    @Transactional(readOnly = true)
    public CardContent loadOwnedImage(Long userId, Long cardId) {
        Card card = requireOwnedCard(userId, cardId);
        Resource resource;
        try {
            resource = photoStorage.load(card.getStoredFilename());
        } catch (BusinessException e) {
            if (e.getErrorCode() == ErrorCode.PHOTO_NOT_FOUND) {
                throw new BusinessException(ErrorCode.CARD_NOT_FOUND);
            }
            throw e;
        }
        return new CardContent(resource, card.getContentType(), card.getStoredFilename());
    }

    @Transactional
    public void delete(Long userId, Long cardId) {
        Card card = requireOwnedCard(userId, cardId);
        String storedName = card.getStoredFilename();
        cardMapper.deleteById(card.getId());
        scheduleAfterCommitDelete(storedName);
    }

    private Trip requireOwnedTrip(Long userId, Long tripId) {
        if (tripId == null) {
            throw new BusinessException(ErrorCode.TRIP_NOT_FOUND);
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

    private Photo requireOwnedPhoto(Long userId, Long photoId) {
        if (photoId == null) {
            throw new BusinessException(ErrorCode.PHOTO_NOT_FOUND);
        }
        Photo photo = photoMapper.findById(photoId);
        if (photo == null) {
            throw new BusinessException(ErrorCode.PHOTO_NOT_FOUND);
        }
        if (!userId.equals(photo.getUserId())) {
            throw new BusinessException(ErrorCode.PHOTO_ACCESS_DENIED);
        }
        return photo;
    }

    private Card requireOwnedCard(Long userId, Long cardId) {
        validateUserId(userId);
        if (cardId == null) {
            throw new BusinessException(ErrorCode.CARD_NOT_FOUND);
        }
        Card card = cardMapper.findById(cardId);
        if (card == null) {
            throw new BusinessException(ErrorCode.CARD_NOT_FOUND);
        }
        if (!userId.equals(card.getUserId())) {
            throw new BusinessException(ErrorCode.CARD_ACCESS_DENIED);
        }
        return card;
    }

    private ImageSize validatePng(MultipartFile file) {
        if (file == null || file.isEmpty() || !PNG_CONTENT_TYPE.equalsIgnoreCase(file.getContentType())) {
            throw new BusinessException(ErrorCode.CARD_INVALID_INPUT, "PNG 카드 파일만 저장할 수 있습니다.");
        }
        try (InputStream in = file.getInputStream()) {
            BufferedImage image = ImageIO.read(in);
            if (image == null || image.getWidth() <= 0 || image.getHeight() <= 0) {
                throw new BusinessException(ErrorCode.CARD_INVALID_INPUT, "PNG 카드 파일이 올바르지 않습니다.");
            }
            return new ImageSize(image.getWidth(), image.getHeight());
        } catch (IOException e) {
            throw new BusinessException(ErrorCode.CARD_STORAGE_FAILED);
        }
    }

    private void registerRollbackCleanup(String storedName) {
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCompletion(int status) {
                if (status == STATUS_ROLLED_BACK) {
                    photoStorage.delete(storedName);
                }
            }
        });
    }

    private void scheduleAfterCommitDelete(String storedName) {
        if (storedName == null || storedName.isBlank()) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            photoStorage.delete(storedName);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                photoStorage.delete(storedName);
            }
        });
    }

    private void validateUserId(Long userId) {
        if (userId == null || userId <= 0) {
            throw new BusinessException(ErrorCode.UNAUTHORIZED);
        }
    }

    private record ImageSize(int width, int height) {
    }
}
