export type LatencySample = {
	path: "local" | "server";
	totalMs: number;
	engineMs: number;
	renderMs: number;
	serverMs?: number;
};

/** Bounded diagnostic samples, with all end-to-end times on the client clock. */
export class MoveLatency {
	private samples: LatencySample[] = [];
	record(sample: LatencySample) {
		this.samples.push(sample);
		if (this.samples.length > 500) this.samples.shift();
	}
	clear() {
		this.samples = [];
	}
	summary() {
		return (["local", "server"] as const).map((path) => {
			const rows = this.samples.filter((sample) => sample.path === path);
			const percentile = (values: number[], fraction: number) => {
				const sorted = [...values].sort((a, b) => a - b);
				return sorted.length
					? sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)]
					: null;
			};
			return {
				path,
				samples: rows.length,
				p50Ms: percentile(
					rows.map((s) => s.totalMs),
					0.5,
				),
				p95Ms: percentile(
					rows.map((s) => s.totalMs),
					0.95,
				),
				engineP50Ms: percentile(
					rows.map((s) => s.engineMs),
					0.5,
				),
				overheadP50Ms: percentile(
					rows.map((s) => s.totalMs - s.engineMs),
					0.5,
				),
			};
		});
	}
}
export const moveLatency = new MoveLatency();
