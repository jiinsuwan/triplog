package com.triplog.photo.mapper;

import com.triplog.photo.domain.Photo;

public interface PhotoMapper {

    int insert(Photo photo);

    Photo findById(Long id);
}
