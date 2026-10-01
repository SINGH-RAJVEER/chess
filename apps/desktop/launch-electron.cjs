const { spawn } = require("node:child_process");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const electron = spawn(
	process.execPath,
	[require.resolve("electron/cli.js"), ".", ...process.argv.slice(2)],
	{ env, stdio: "inherit" },
);

electron.on("error", (error) => {
	console.error("Failed to launch Electron:", error);
	process.exitCode = 1;
});

electron.on("exit", (code, signal) => {
	if (signal) {
		console.error(`Electron exited with signal ${signal}`);
		process.exitCode = 1;
	} else {
		process.exitCode = code ?? 1;
	}
});
