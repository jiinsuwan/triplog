package com.triplog.photo.mapper;

import com.triplog.photo.domain.PhotoOutline;
import org.apache.ibatis.annotations.Param;

import java.util.List;

/**
 * 사진 윤곽선 전처리 상태/결과 mapper (S3-LOG-02 #70).
 */
public interface PhotoOutlineMapper {

    /** 업로드 시 PENDING 행 생성. */
    int insertPending(@Param("photoId") Long photoId);

    /** 사진의 윤곽선 상태/결과 조회(없으면 null). */
    PhotoOutline findByPhotoId(@Param("photoId") Long photoId);

    /** 백그라운드 워커: 전처리 대기(PENDING) 사진 id 를 오래된 순으로 일부 가져온다. */
    List<Long> findPendingPhotoIds(@Param("limit") int limit);

    /** 전처리 성공: items 채우고 READY 로. */
    int markReady(@Param("photoId") Long photoId, @Param("items") String items);

    /** 전처리 실패: error 남기고 FAILED 로. */
    int markFailed(@Param("photoId") Long photoId, @Param("error") String error);
}
