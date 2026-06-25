package com.triplog.card.mapper;

import com.triplog.card.domain.Card;
import com.triplog.card.domain.MemorySummary;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface CardMapper {

    int insert(Card card);

    int update(Card card);

    Card findById(Long id);

    Card findByTripAndPhotoForUpdate(@Param("tripId") Long tripId, @Param("photoId") Long photoId);

    List<Card> findByTripId(Long tripId);

    List<MemorySummary> findMemorySummariesByUser(Long userId);

    List<String> findStoredFilenamesByTrip(Long tripId);

    List<String> findStoredFilenamesByUser(Long userId);

    int deleteById(Long id);
}
