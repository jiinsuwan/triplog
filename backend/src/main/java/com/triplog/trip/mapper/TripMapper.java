package com.triplog.trip.mapper;

import com.triplog.trip.domain.Trip;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface TripMapper {

    int insert(Trip trip);

    Trip findById(Long id);

    List<Trip> findByUserId(@Param("userId") Long userId,
                            @Param("limit") int limit,
                            @Param("offset") int offset);

    long countByUserId(Long userId);

    int update(Trip trip);

    int deleteById(Long id);
}
