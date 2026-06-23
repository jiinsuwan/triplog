package com.triplog.place.mapper;

import com.triplog.place.domain.Place;
import com.triplog.place.domain.PlaceRegion;
import org.apache.ibatis.annotations.Param;

import java.util.List;

public interface PlaceMapper {

    List<Place> find(@Param("region1") String region1,
                     @Param("region2") String region2,
                     @Param("placeTypes") List<String> placeTypes,
                     @Param("category") String category,
                     @Param("keyword") String keyword,
                     @Param("limit") int limit,
                     @Param("offset") int offset);

    long count(@Param("region1") String region1,
               @Param("region2") String region2,
               @Param("placeTypes") List<String> placeTypes,
               @Param("category") String category,
               @Param("keyword") String keyword);

    Place findById(@Param("id") Long id);

    List<PlaceRegion> findRegions();

    List<String> findCategories();
}
