import type { Migration } from "./migration";
import type { Model } from "./model";
import type { Driver, DriverFactory } from "./types";

export interface KfgMLOptions {
	models: Model<any>[];
	migrations?: Migration[];
}

export class KfgML<D extends Driver<any>> {
	public driver: D;
	public factory: DriverFactory<any, any>;
	public models: Model<any>[];
	public migrations: Migration[];

	constructor(
		driverOrFactory: D | DriverFactory<any, any>,
		public options: KfgMLOptions,
	) {
		if (typeof driverOrFactory === "function") {
			this.factory = driverOrFactory;
			this.driver = driverOrFactory({}) as D;
		} else {
			this.driver = driverOrFactory;
			this.factory = () => driverOrFactory;
		}
		this.models = options.models;
		this.migrations = options.migrations || [];
		this.init();
	}

	private init() {
		for (const model of this.models) {
			model.setDriver(this.driver, this.factory);
		}
	}

	public getModel(name: string): Model<any> | undefined {
		return this.models.find((m) => m.name === name);
	}

	public async migrate() {
		// Simple implementation: run all migrations in sequence
		// In a real scenario, we'd check which ones were already run.
		for (const migration of this.migrations) {
			console.log(`[KfgML] Running migration: ${migration.name}`);
			await migration.up(this.driver);
		}
	}
}
