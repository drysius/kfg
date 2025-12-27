import type { KfgML } from "./kfg-ml";
import type { Driver } from "./types";

export interface MigrationOptions {
	name: string;
	up: (driver: Driver<any>) => void | Promise<void>;
	down: (ml: KfgML<any>) => void | Promise<void>;
}

export class Migration {
	public name: string;
	public up: (driver: Driver<any>) => void | Promise<void>;
	public down: (ml: KfgML<any>) => void | Promise<void>;

	constructor(options: MigrationOptions) {
		this.name = options.name;
		this.up = options.up;
		this.down = options.down;
	}
}
