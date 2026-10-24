// tests/benchmark.test.js

import http from "k6/http";
import { check } from "k6";
import { Counter } from "k6/metrics";

http.setResponseCallback(http.expectedStatuses(200, 201, 409));

const successfulHolds = new Counter("successful_holds");
const rejectedHolds = new Counter("rejected_holds");
const successfulPayments = new Counter("successful_payments");
const serverErrors = new Counter("server_500_errors");

export const options = {
    scenarios: {
        flash_sale_stress: {
            executor: "shared-iterations",
            vus: 250,
            iterations: 5000,
            maxDuration: "30s",
        },
    },
    thresholds: {
        http_req_failed: ["rate==0.00"],
        http_req_duration: ["p(95)<220"],
    },
};

const BASE_URL = "http://localhost:3000/api";
const TARGET_EVENT_ID = 1;
const TARGET_SEAT_ID = 31;

export default function () {
    const userId = `bench-user-${__VU}-${__ITER}`;

    const payload = JSON.stringify({
        eventId: TARGET_EVENT_ID,
        seatId: TARGET_SEAT_ID,
        userId: userId,
    });

    const params = {
        headers: { "Content-Type": "application/json" },
    };

    const holdRes = http.post(`${BASE_URL}/seats/hold`, payload, params);

    if (holdRes.status === 200 || holdRes.status === 201) {
        successfulHolds.add(1);

        const payRes = http.post(
            `${BASE_URL}/payments/create-checkout-session`,
            payload,
            params,
        );
        if (payRes.status === 200) {
            successfulPayments.add(1);
        }
    } else if (holdRes.status === 409) {
        rejectedHolds.add(1);
    } else if (holdRes.status >= 500) {
        serverErrors.add(1);
    }

    check(holdRes, {
        "Zero Server Errors (No 500s)": (r) =>
            r.status === 200 || r.status === 201 || r.status === 409,
    });
}
