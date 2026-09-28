import { io } from "socket.io-client";
import { getBaseUrl } from "./api";

const SOCKET_URL = getBaseUrl();

console.log("🔌 CONNECTING SOCKET TO:", SOCKET_URL);

export const socket = io(SOCKET_URL, {
  transports: ["websocket"],
  autoConnect: true,
});