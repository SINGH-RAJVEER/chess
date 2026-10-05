const { app, BrowserWindow, ipcMain, net, protocol } = require("electron");
const { existsSync, statSync } = require("node:fs");
const { join, resolve, sep } = require("node:path");
const { pathToFileURL } = require("node:url");
const { NativeEngine } = require("./engine.cjs");
const engines = new Map();

app.setName("SixtyFour");
if (process.env.ELECTRON_USER_DATA_DIR) app.setPath("userData", process.env.ELECTRON_USER_DATA_DIR);

function engineFor(event) {
	const window = BrowserWindow.fromWebContents(event.sender);
	if (!window || event.senderFrame !== event.sender.mainFrame)
		throw new Error("Invalid engine caller");
	let engine = engines.get(event.sender.id);
	if (!engine) {
		engine = new NativeEngine(process.resourcesPath, app.isPackaged);
		engines.set(event.sender.id, engine);
		window.on("closed", () => {
			engine.dispose();
			engines.delete(event.sender.id);
		});
	}
	return engine;
}

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
			existsSync(candidate) && statSync(candidate).isFile()
				? candidate
				: join(root, "index.html");
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
		title: "SixtyFour",
		icon: join(__dirname, "icons/icon.png"),
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
		void window.loadURL("app://sixtyfour/");
	}
}

app.whenReady().then(() => {
	registerAppProtocol();
	ipcMain.handle("engine:prepare", (event, opponent) => engineFor(event).prepare(opponent));
	ipcMain.handle("engine:search", (event, request) => engineFor(event).search(request));
	ipcMain.handle("engine:reset", (event) => engineFor(event).reset());
	ipcMain.handle("engine:cancel", (event) => engineFor(event).dispose());
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
