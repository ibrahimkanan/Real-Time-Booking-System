import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";

// Custom Metrics
const successfulHolds = new Counter("successful_holds");
const rejectedHolds = new Counter("rejected_holds");
const successfulPayments = new Counter("successful_payments");

// Test Configuration
export const options = {
    scenarios: {
        seat_snipers: {
            executor: "per-vu-iterations",
            vus: 100,
            iterations: 1,
            maxDuration: "10s",
        },
    },
};

const BASE_URL = "http://localhost:3000/api";
const TARGET_EVENT_ID = 1;
const TARGET_SEAT_ID = 25;

export default function () {
    const userId = `vu-user-${__VU}`;

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
            `http://localhost:3000/api/payments/create-checkout-session`,
            payload,
            params,
        );
        console.log(`[Payment Debug] Status: ${payRes.status} | Body: ${payRes.body}`);

        check(payRes, {
            "Payment succeeded (status 200)": (r) => r.status === 200,
        });

        if (payRes.status === 200) {
            successfulPayments.add(1);
            console.log(
                `🏆 Winner is ${userId}! Booking Ref: ${payRes.json("bookingReference")}`,
            );
        }
    } else if (holdRes.status === 409) {
        rejectedHolds.add(1);
    }

    check(holdRes, {
        "Status is either 200/201 (Won) or 409 (Locked out)": (r) =>
            r.status === 200 || r.status === 201 || r.status === 409,
    });

    sleep(0.1);
}
