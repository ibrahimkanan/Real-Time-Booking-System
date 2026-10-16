// src/test-concurrency.ts

const testConcurrency = async () => {
    const url = "http://localhost:3000/api/seats/hold";
    const seatId = 3;
    const eventId = 1;

    console.log(`🚀 Sending 10 concurrent hold requests for Seat ${seatId}...`);

    const requests = Array.from({ length: 10 }).map((_, index) => {
        const userId = `user-${index + 1}`;

        return fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ eventId, seatId, userId }),
        })
            .then(async (res) => {
                const data = await res.json();
                return { userId, status: res.status, response: data };
            })
            .catch((err) => ({ userId, status: 500, response: err.message }));
    });

    const results = await Promise.all(requests);

    const successes = results.filter((r) => r.status === 200);
    const conflicts = results.filter((r) => r.status === 409);

    console.log("\n --- Test Results ---");
    console.log(
        `Successful holds: ${successes.length} (Should be exactly 1)`,
    );
    console.log(
        `Rejected holds: ${conflicts.length} (Should be exactly 9)\n`,
    );

    if (successes.length === 1) {
        console.log(`WINNER: ${successes[0].userId} got the seat!`);
    } else {
        console.log(
            `WARNING: System allowed ${successes.length} users to hold the same seat!`,
        );
    }
};

testConcurrency();
