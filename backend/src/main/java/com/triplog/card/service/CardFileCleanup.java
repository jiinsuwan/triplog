package com.triplog.card.service;

import com.triplog.card.mapper.CardMapper;
import com.triplog.photo.storage.PhotoStorage;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

/** 여행·회원 삭제 시 저장된 카드 PNG 파일을 커밋 후 정리한다. */
@Component
public class CardFileCleanup {

    private final CardMapper cardMapper;
    private final PhotoStorage photoStorage;

    public CardFileCleanup(CardMapper cardMapper, PhotoStorage photoStorage) {
        this.cardMapper = cardMapper;
        this.photoStorage = photoStorage;
    }

    /** 여행 삭제 전 호출한다. cards row 는 FK cascade 로 삭제되고, PNG 파일은 커밋 후 지운다. */
    public void scheduleFileCleanupForTrip(Long tripId) {
        scheduleFileCleanup(cardMapper.findStoredFilenamesByTrip(tripId));
    }

    /** 회원 탈퇴 전 호출한다. users 삭제 cascade 전에 파일명을 확보해야 한다. */
    public void scheduleFileCleanupForUser(Long userId) {
        scheduleFileCleanup(cardMapper.findStoredFilenamesByUser(userId));
    }

    private void scheduleFileCleanup(List<String> storedNames) {
        if (storedNames.isEmpty()) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            storedNames.forEach(photoStorage::delete);
            return;
        }
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override
            public void afterCommit() {
                storedNames.forEach(photoStorage::delete);
            }
        });
    }
}
