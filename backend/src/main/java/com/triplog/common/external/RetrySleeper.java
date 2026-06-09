package com.triplog.common.external;

import java.time.Duration;

@FunctionalInterface
interface RetrySleeper {

    void sleep(Duration duration) throws InterruptedException;
}
