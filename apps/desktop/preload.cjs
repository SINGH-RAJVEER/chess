const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("sixtyfourDesktop", {
	close: () => ipcRenderer.send("window:close"),
	engine: {
		prepare: (opponent) => ipcRenderer.invoke("engine:prepare", opponent),
		search: (request) => ipcRenderer.invoke("engine:search", request),
		reset: () => ipcRenderer.invoke("engine:reset"),
		cancel: () => ipcRenderer.invoke("engine:cancel"),
	},
});
