package com.triplog.photo.mapper;

import com.triplog.photo.domain.Photo;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface PhotoMapper {

    int insert(Photo photo);

    Photo findById(Long id);

    List<Photo> findByTripId(Long tripId);

    List<String> findStoredFilenamesByTrip(Long tripId);

    List<String> findStoredFilenamesByUser(Long userId);

    int updateTripId(@Param("id") Long id, @Param("tripId") Long tripId);
}
