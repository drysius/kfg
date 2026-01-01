import { deepMerge } from "./utils/object";

export class KfgStore {
	private map = new Map<string, any>();

	public get<T>(key: string, defaultValue?: T): T {
		return (this.map.get(key) ?? defaultValue) as T;
	}

	public set<T>(key: string, value: T): void {
		this.map.set(key, value);
	}

	public merge<T extends object>(key: string, value: Partial<T>): void {
		const current = this.get<T>(key, {} as T);
		this.set(key, deepMerge(current, value));
	}

	public insert<T extends object>(key: string, value: Partial<T>): void {
		const current = this.get<T>(key, {} as T);
		Object.assign(current as any, value);
		this.set(key, current);
	}
}
