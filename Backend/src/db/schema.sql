-- schema.sql

-- 1. Events Table
CREATE TABLE IF NOT EXISTS "Events" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    event_date TIMESTAMP WITH TIME ZONE NOT NULL,
    total_seats INT NOT NULL DEFAULT 50,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Seats Table (with status check: 'available', 'held', 'booked')
CREATE TABLE IF NOT EXISTS "Seats" (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES "Events"(id) ON DELETE CASCADE,
    seat_number VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'held', 'booked')),
    version INT NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT unique_event_seat UNIQUE (event_id, seat_number)
);

-- 3. Bookings Table
CREATE TABLE IF NOT EXISTS "Bookings" (
    id SERIAL PRIMARY KEY,
    event_id INT NOT NULL REFERENCES "Events"(id) ON DELETE CASCADE,
    seat_id INT NOT NULL REFERENCES "Seats"(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL,
    booking_reference VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'confirmed' CHECK (status IN ('pending', 'confirmed', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Helpful indices for real-time querying
CREATE INDEX IF NOT EXISTS idx_seats_event_status ON "Seats"(event_id, status);
CREATE INDEX IF NOT EXISTS idx_bookings_seat ON "Bookings"(seat_id);
