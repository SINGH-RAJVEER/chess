/** Background archive sync never blocks storage writes or engine requests. */
export class ArchiveSync {
	private latest: string | null = null;
	private timer: ReturnType<typeof setTimeout> | null = null;
	private running = false;
	private enabled = false;
	constructor(private send: (value: string) => Promise<void>) {}
	setEnabled(enabled: boolean) {
		this.enabled = enabled;
		if (enabled) this.schedule();
		else if (this.timer) {
			clearTimeout(this.timer);
			this.timer = null;
		}
	}
	update(value: string) {
		this.latest = value;
		this.schedule();
	}
	private schedule(delay = 1000) {
		if (!this.enabled || !this.latest || this.running || this.timer) return;
		this.timer = setTimeout(() => {
			this.timer = null;
			void this.flush();
		}, delay);
	}
	private async flush() {
		if (!this.enabled || !this.latest) return;
		const value = this.latest;
		this.running = true;
		try {
			await this.send(value);
			if (this.latest === value) this.latest = null;
		} catch {
			/* The durable local copy is retried when connectivity returns. */
		} finally {
			this.running = false;
			this.schedule(this.latest === value ? 15000 : 1000);
		}
	}
	dispose() {
		this.enabled = false;
		if (this.timer) clearTimeout(this.timer);
		this.timer = null;
	}
}
