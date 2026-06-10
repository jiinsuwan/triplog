package com.triplog.photo.service;

import com.triplog.photo.mapper.PhotoMapper;
import com.triplog.photo.storage.PhotoStorage;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

import java.util.List;

/**
 * 여행 삭제 시 그 여행에 연결된 사진 파일을 디스크에서 정리한다(S2-LOG-03 #37).
 *
 * 호출 규약:
 *  - TripService.delete() 가 trips 를 지우기 *전에* 호출해야 한다 — FK ON DELETE CASCADE 로
 *    photos row 가 사라지면 stored_filename 을 더는 못 찾기 때문이다(삭제 전 조회 필수).
 *  - 실제 파일 삭제는 트랜잭션 커밋 *후*(afterCommit)에 한다 — 커밋 전에 지웠다가 롤백되면
 *    row 는 살아있는데 파일만 사라지는 손실이 생긴다. 커밋 후 삭제면 최악이라도 고아 파일만 남는다.
 *    (PhotoService 업로드의 롤백-정리 패턴과 대칭.)
 *
 * trip → photo 단방향 의존을 위해 photo 쪽이 이 컴포넌트를 제공한다(TripService 가 주입해 호출).
 */
@Component
public class PhotoTripCleanup {

    private final PhotoMapper photoMapper;
    private final PhotoStorage photoStorage;

    public PhotoTripCleanup(PhotoMapper photoMapper, PhotoStorage photoStorage) {
        this.photoMapper = photoMapper;
        this.photoStorage = photoStorage;
    }

    /** 여행에 연결된 사진 파일을 커밋 후 삭제하도록 예약한다. trips 삭제 *전에* 호출할 것. */
    public void scheduleFileCleanupForTrip(Long tripId) {
        List<String> storedNames = photoMapper.findStoredFilenamesByTrip(tripId);
        if (storedNames.isEmpty()) {
            return;
        }
        if (!TransactionSynchronizationManager.isSynchronizationActive()) {
            // 트랜잭션 밖이면 즉시 삭제(방어적 — 정상 경로는 트랜잭션 안에서 호출된다).
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
