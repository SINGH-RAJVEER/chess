const { app, BrowserWindow, ipcMain, net, protocol } = require("electron");
const { existsSync, statSync } = require("node:fs");
const { join, resolve, sep } = require("node:path");
const { pathToFileURL } = require("node:url");

protocol.registerSchemesAsPrivileged([
	{
		scheme: "app",
		privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
	},
]);

function webDirectory() {
	return app.isPackaged ? join(process.resourcesPath, "web") : join(__dirname, "../web/dist");
}

function registerAppProtocol() {
	protocol.handle("app", (request) => {
		const pathname = decodeURIComponent(new URL(request.url).pathname);
		const root = webDirectory();
		const candidate = resolve(root, `.${pathname}`);
		const resolvedRoot = resolve(root);
		if (candidate !== resolvedRoot && !candidate.startsWith(`${resolvedRoot}${sep}`)) {
			return new Response("Not found", { status: 404 });
		}
		const file =
			existsSync(candidate) && statSync(candidate).isFile() ? candidate : join(root, "index.html");
		return net.fetch(pathToFileURL(file).toString());
	});
}

function createWindow() {
	const window = new BrowserWindow({
		width: 1280,
		height: 832,
		minWidth: 960,
		minHeight: 640,
		center: true,
		frame: false,
		webPreferences: {
			preload: join(__dirname, "preload.cjs"),
			contextIsolation: true,
			nodeIntegration: false,
			sandbox: true,
		},
	});

	if (process.env.ELECTRON_RENDERER_URL) {
		void window.loadURL(process.env.ELECTRON_RENDERER_URL);
	} else {
		void window.loadURL("app://chess/");
	}
}

app.whenReady().then(() => {
	registerAppProtocol();
	ipcMain.on("window:close", (event) => {
		BrowserWindow.fromWebContents(event.sender)?.close();
	});
	createWindow();
	app.on("activate", () => {
		if (BrowserWindow.getAllWindows().length === 0) createWindow();
	});
});

app.on("window-all-closed", () => {
	if (process.platform !== "darwin") app.quit();
});
