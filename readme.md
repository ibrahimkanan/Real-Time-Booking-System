# High Concurrency Ticket Reservation Engine

High demand ticket releases represent one of the most unforgiving challenges in backend engineering. When thousands of users attempt to reserve the exact same seat within the same millisecond, standard application architectures break down. Naive read and write database cycles inevitably introduce race conditions, resulting in double bookings, inconsistent payment states, and database connection exhaustion.

This project is a production grade, real time ticket booking system engineered specifically to eliminate race conditions under extreme flash sale traffic. By pairing sub millisecond atomic distributed locks in Redis with strict ACID transactions and pessimistic row locking in PostgreSQL, the architecture guarantees absolute inventory integrity. Every state transition is broadcast instantaneously to connected clients via WebSockets, ensuring that thousands of concurrent viewers see live seat availability without polling the server.

## System Architecture and Engineering Design

### 1. Dual Layer Concurrency Control

To protect the relational database from lock contention during massive traffic spikes, the system enforces a two stage locking mechanism:

- **In Memory Atomic Gatekeeper (Redis):** When a user requests a seat, the server executes an atomic `SET key value NX EX 300` command in Redis. Because Redis is single threaded, only the first request arriving at the microsecond level succeeds in acquiring the lock for 5 minutes. All subsequent concurrent requests for that seat are rejected at the memory layer in under 2 milliseconds with an `HTTP 409 Conflict` response, shielding PostgreSQL from unnecessary write load.

- **Pessimistic Database Transactions (PostgreSQL):** Once the Redis lock is acquired, the system opens a dedicated PostgreSQL transaction and executes `SELECT status FROM "Seats" WHERE id = $1 FOR UPDATE`. This acquires a row level lock before transitioning the seat state to `held` or `booked`, providing a secondary guarantee against double booking even in the event of a cache failure.

### 2. Asynchronous Payment Pipeline and Webhook Verification

Reservation holds are decoupled from payment processing using Stripe Checkout:

- **Lock Ownership Validation:** Before generating a payment session, the backend validates that the requesting user still owns the active TTL lock in Redis.

- **Cryptographic Webhook Finalization:** Final booking confirmation is driven asynchronously through a dedicated Stripe Webhook endpoint (`/api/payments/webhook`) using raw body cryptographic signature verification (`stripe-signature`). Upon receiving the `checkout.session.completed` event, the server atomically updates the seat status to `booked`, generates a unique UUID booking reference inside PostgreSQL, and purges the temporary hold key from Redis.

- **Dual Mode Execution:** The engine includes an environment controlled `mock` payment mode that simulates a 200ms payment gateway latency, enabling full end to end stress testing without triggering external Stripe API rate limits.

### 3. Real Time Event Broadcasting (Socket.io)

Instead of relying on expensive client side HTTP polling, the system utilizes Socket.io rooms scoped by event identifier (`event:{eventId}`). Whenever a seat transitions between `available`, `held`, or `booked`, the backend emits a targeted `seatStatusUpdated` payload exclusively to clients viewing that specific event.

### 4. Automated Self Healing Background Worker

Users frequently abandon checkout sessions after locking a seat. A dedicated background worker runs on a 60 second interval, querying PostgreSQL for seats stuck in the `held` state beyond their 5 minute expiration window. Expired seats are automatically reverted to `available`, and the worker immediately broadcasts the freed seat IDs over WebSockets so active users can claim them in real time.

## Performance and Load Testing Benchmarks

The system was stress tested using **Grafana k6** to simulate a high contention flash sale where 250 concurrent virtual users aggressively target the exact same seat across 5,000 shared iterations.

- **Test Scenario:** 5,000 atomic reservation attempts across 250 concurrent Virtual Users
- **Sustained Throughput:** 1,562.01 requests per second (5,000 requests completed in 3.2 seconds)
- **Median Latency:** 152.99 ms
- **90th Percentile Latency (p90):** 176.99 ms
- **95th Percentile Latency (p95):** 188.50 ms
- **Maximum Latency:** 219.99 ms
- **Concurrency Accuracy:** 100% (Exactly 1 winner secured the seat and completed payment; 4,999 competing requests were deterministically rejected with `409 Conflict`)
- **Server Error Rate (5xx):** 0.00% (0 failed checks out of 5,000 requests)

## Technology Stack

- **Backend Runtime and Framework:** Node.js, Express.js, TypeScript
- **Primary Database:** PostgreSQL (Connection pooling via `pg`, ACID transactions, row level locking)
- **Distributed Cache and Lock Manager:** Redis (`SET NX` atomic locks with automated TTL expiration)
- **Real Time Synchronization:** Socket.io (Room based bidirectional WebSockets)
- **Payment Infrastructure:** Stripe API, Stripe Checkout Sessions, Webhook signature verification
- **Frontend Client:** React (Vite), Socket.io Client, custom dark and blue interactive seat grid
- **Load Testing Suite:** Grafana k6

## Project Structure

```text
Real-Time-Booking-System/
├── Backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── db.ts                  # PostgreSQL connection pool
│   │   │   ├── redis.ts               # Redis client configuration
│   │   │   ├── socket.ts              # Socket.io server and room emitters
│   │   │   └── stripe.ts              # Stripe SDK initialization
│   │   ├── controllers/
│   │   │   ├── payment.controller.ts  # Checkout sessions, mock mode, and webhooks
│   │   │   └── seat.controller.ts     # Atomic seat hold and booking logic
│   │   ├── routes/
│   │   │   ├── payment.route.ts       # Payment and raw webhook endpoints
│   │   │   └── seat.route.ts          # Seat retrieval and reservation routes
│   │   ├── workers/
│   │   │   └── seat.worker.ts         # Background worker for expired seat recovery
│   │   └── index.ts                   # Express and HTTP server entry point
│   └── tests/
│       ├── race-condition.test.js     # 100 VU single seat sniper test
│       └── benchmark.test.js          # 5,000 iteration high throughput stress test
└── Frontend/
    └── src/
        ├── App.jsx                    # Real time interactive seat map and live event log
        └── App.css                    # Styling for seat states and layout
```

## Database Schema and Initialization

Execute the following SQL script in your PostgreSQL database (`booking_db`) to create the required tables and seed an initial event with 30 available seats:

```sql
CREATE TABLE IF NOT EXISTS "Events" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    event_date TIMESTAMP NOT NULL,
    total_seats INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "Seats" (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES "Events"(id) ON DELETE CASCADE,
    seat_number VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held', 'booked')),
    price NUMERIC(10, 2) NOT NULL DEFAULT 50.00,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(event_id, seat_number)
);

CREATE TABLE IF NOT EXISTS "Bookings" (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES "Events"(id),
    seat_id INT NOT NULL REFERENCES "Seats"(id),
    user_id VARCHAR(100) NOT NULL,
    booking_reference VARCHAR(100) UNIQUE NOT NULL,
    payment_status VARCHAR(50) NOT NULL DEFAULT 'paid',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO "Events" (id, name, event_date, total_seats)
VALUES (1, 'Global Tech Symphony', NOW() + INTERVAL '30 days', 30)
ON CONFLICT (id) DO NOTHING;

INSERT INTO "Seats" (event_id, seat_number, status, price)
SELECT 1, 'A' || generate_series(1, 30), 'available', 50.00
ON CONFLICT (event_id, seat_number) DO NOTHING;
```

## API Reference

### 1. Retrieve Event Seats

- **Endpoint:** `GET /api/seats/:eventId`
- **Description:** Returns the complete list of seats and their current states (`available`, `held`, `booked`) ordered by seat ID.

### 2. Hold a Seat

- **Endpoint:** `POST /api/seats/hold`
- **Payload:**

```json
{
    "eventId": 1,
    "seatId": 12,
    "userId": "user_9012"
}
```

- **Responses:**
    - `200 OK`: Seat locked in Redis for 5 minutes, marked as `held` in PostgreSQL, and broadcast via Socket.io.
    - `409 Conflict`: Seat is already held or booked by another user.

### 3. Create Checkout Session

- **Endpoint:** `POST /api/payments/create-checkout-session`
- **Payload:**

```json
{
    "eventId": 1,
    "seatId": 12,
    "userId": "user_9012"
}
```

- **Responses:**
    - `200 OK`: Returns a Stripe Checkout redirect URL in `live` mode, or confirms the booking immediately and returns a `bookingReference` UUID in `mock` mode.
    - `403 Forbidden`: The requesting user does not hold a valid Redis lock for the specified seat.

### 4. Stripe Webhook Listener

- **Endpoint:** `POST /api/payments/webhook`
- **Description:** Consumes raw request bodies to validate the `stripe-signature` header and processes `checkout.session.completed` events to finalize bookings in PostgreSQL and release Redis holds.

## Local Setup and Execution

### Prerequisites

- Node.js (v18 or higher)
- PostgreSQL instance running locally or via Docker
- Redis server running locally or via Docker
- Grafana k6 installed (for running concurrency benchmarks)

### 1. Configure Environment Variables

Create a `.env` file inside the `Backend` directory:

```env
PORT=3000
DATABASE_URL=postgresql://postgres:yourpassword@localhost:5432/booking_db
REDIS_URL=redis://localhost:6379
STRIPE_SECRET_KEY=sk_test_your_stripe_secret_key
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_signing_secret
PAYMENT_MODE=mock
```

### 2. Start the Backend Server

```bash
cd Backend
docker compose up -d
npm install
npm run dev
```

### 3. Start the React Frontend

```bash
cd Frontend
npm install
npm run dev
```

Open `http://localhost:5173` in two separate browser windows side by side to observe real time seat locking and live WebSocket state transitions.

### 4. Run the Concurrency Stress Tests

With `PAYMENT_MODE=mock` enabled in `.env` and the backend server running, execute either the 100 VU single seat sniper test or the 5,000 request benchmark from the `Backend` directory:

```bash
k6 run tests/race-condition.test.js
k6 run tests/benchmark.test.js
```
