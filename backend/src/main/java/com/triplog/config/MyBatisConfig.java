package com.triplog.config;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.context.annotation.Configuration;

/**
 * MyBatis Mapper 스캔 설정 (architecture §2-1).
 * 각 도메인 패키지의 mapper 인터페이스(com.triplog.{domain}.mapper)를 자동 등록한다.
 * underscore ↔ camelCase 매핑은 application.yml 의 map-underscore-to-camel-case 로 처리.
 */
@Configuration
@MapperScan("com.triplog.**.mapper")
public class MyBatisConfig {
}
