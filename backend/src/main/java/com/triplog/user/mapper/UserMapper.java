package com.triplog.user.mapper;

import com.triplog.user.domain.User;
import org.apache.ibatis.annotations.Param;

public interface UserMapper {

    int countByEmail(String email);

    User findByEmail(String email);

    User findById(Long id);

    User findByIdForUpdate(Long id);

    int existsById(Long id);

    int insert(User user);

    int updateProfile(@Param("id") Long id,
                      @Param("nickname") String nickname,
                      @Param("profileImg") String profileImg);

    int updatePassword(@Param("id") Long id, @Param("password") String password);

    int deleteById(Long id);
}
