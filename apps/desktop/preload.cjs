const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("chessDesktop", {
	close: () => ipcRenderer.send("window:close"),
});
