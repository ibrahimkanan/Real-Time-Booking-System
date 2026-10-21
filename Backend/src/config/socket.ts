// src/config/socket.ts

import { Server as HttpServer } from "http";
import { Server } from "socket.io";

let io: Server | null = null;

export const initSocket = (httpServer: HttpServer): Server => {
    io = new Server(httpServer, {
        cors: {
            origin: "*",
            methods: ["GET", "POST"],
        },
    });

    io.on("connection", (socket) => {
        console.log(`[Socket] User connected: ${socket.id}`);

        socket.on("joinEvent", (eventId: number | string) => {
            const roomName = `event:${eventId}`;
            socket.join(roomName);
            console.log(`[Socket] Socket ${socket.id} joined room ${roomName}`);
        });

        socket.on("disconnect", () => {
            console.log(`[Socket] User disconnected: ${socket.id}`);
        });
    });

    return io;
};

export const emitSeatUpdate = (
    eventId: number,
    seatId: number,
    status: "available" | "held" | "booked",
): void => {
    if (!io) return;

    const roomName = `event:${eventId}`;
    io.to(roomName).emit("seatStatusUpdated", {
        eventId,
        seatId,
        status,
        updatedAt: new Date().toISOString(),
    });
};
