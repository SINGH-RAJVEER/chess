type SoundType =
	| "move"
	| "capture"
	| "check"
	| "castle"
	| "promote"
	| "gameStart"
	| "gameEnd"
	| "lowTime"
	| "illegal";

let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext {
	if (!audioContext) {
		audioContext = new AudioContext();
	}
	return audioContext;
}

function playTone(
	frequency: number,
	duration: number,
	type: OscillatorType = "sine",
	volume = 0.3,
	attack = 0.01,
	decay?: number,
) {
	const ctx = getAudioContext();
	const oscillator = ctx.createOscillator();
	const gainNode = ctx.createGain();

	oscillator.type = type;
	oscillator.frequency.value = frequency;
	oscillator.connect(gainNode);
	gainNode.connect(ctx.destination);

	const now = ctx.currentTime;
	gainNode.gain.setValueAtTime(0, now);
	gainNode.gain.linearRampToValueAtTime(volume, now + attack);
	gainNode.gain.exponentialRampToValueAtTime(0.001, now + (decay ?? duration));

	oscillator.start(now);
	oscillator.stop(now + duration);
}

function playNoise(duration: number, volume = 0.15) {
	const ctx = getAudioContext();
	const bufferSize = ctx.sampleRate * duration;
	const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
	const data = buffer.getChannelData(0);

	for (let i = 0; i < bufferSize; i++) {
		data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.2));
	}

	const source = ctx.createBufferSource();
	source.buffer = buffer;

	const gainNode = ctx.createGain();
	gainNode.gain.value = volume;

	const filter = ctx.createBiquadFilter();
	filter.type = "highpass";
	filter.frequency.value = 2000;

	source.connect(filter);
	filter.connect(gainNode);
	gainNode.connect(ctx.destination);

	source.start();
}

const SOUND_GENERATORS: Record<SoundType, () => void> = {
	move: () => {
		playNoise(0.08, 0.2);
		playTone(600, 0.06, "sine", 0.15, 0.005, 0.04);
	},
	capture: () => {
		playNoise(0.15, 0.3);
		playTone(300, 0.12, "triangle", 0.25, 0.005, 0.08);
		playTone(200, 0.15, "sine", 0.15, 0.02, 0.1);
	},
	check: () => {
		playTone(880, 0.12, "square", 0.2, 0.005, 0.08);
		setTimeout(() => playTone(1100, 0.15, "square", 0.2, 0.005, 0.1), 80);
	},
	castle: () => {
		playNoise(0.06, 0.15);
		playTone(500, 0.06, "sine", 0.12, 0.005, 0.04);
		setTimeout(() => {
			playNoise(0.06, 0.15);
			playTone(550, 0.06, "sine", 0.12, 0.005, 0.04);
		}, 100);
	},
	promote: () => {
		playTone(523, 0.1, "sine", 0.2, 0.005, 0.08);
		setTimeout(() => playTone(659, 0.1, "sine", 0.2, 0.005, 0.08), 80);
		setTimeout(() => playTone(784, 0.15, "sine", 0.25, 0.005, 0.12), 160);
	},
	gameStart: () => {
		playTone(440, 0.12, "sine", 0.15, 0.01, 0.08);
		setTimeout(() => playTone(554, 0.12, "sine", 0.15, 0.01, 0.08), 100);
		setTimeout(() => playTone(659, 0.2, "sine", 0.2, 0.01, 0.15), 200);
	},
	gameEnd: () => {
		playTone(659, 0.15, "sine", 0.2, 0.01, 0.1);
		setTimeout(() => playTone(554, 0.15, "sine", 0.2, 0.01, 0.1), 150);
		setTimeout(() => playTone(440, 0.3, "sine", 0.25, 0.01, 0.25), 300);
	},
	lowTime: () => {
		playTone(1000, 0.08, "square", 0.15, 0.005, 0.06);
	},
	illegal: () => {
		playTone(200, 0.15, "sawtooth", 0.2, 0.005, 0.1);
	},
};

export function playSound(sound: SoundType) {
	try {
		SOUND_GENERATORS[sound]();
	} catch {
		// Audio context may not be available
	}
}

export function resumeAudioContext() {
	if (audioContext?.state === "suspended") {
		void audioContext.resume();
	}
}
