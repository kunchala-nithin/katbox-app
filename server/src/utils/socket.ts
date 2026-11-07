import type { Server } from "socket.io";

let socketServer: Server | null = null;

export const setSocketServer = (server: Server) => {
  socketServer = server;
};

/** Notify only the room associated with the affected MongoDB user ID. */
export const emitChefAccessChanged = (userId: string, isChef: boolean) => {
  if (!socketServer || !userId) return;
  socketServer.to(String(userId)).emit("chef-access-changed", {
    userId: String(userId),
    isChef: isChef === true,
    updatedAt: new Date().toISOString(),
  });
};
