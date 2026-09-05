import { io } from "socket.io-client";

export const socket = io("https://katbox-app.onrender.com", {
  transports: ["websocket"],
});