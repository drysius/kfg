import { Kfg } from "./kfg";
import type {
	Driver,
	DriverFactory,
	inPromise,
	SchemaDefinition,
	StaticSchema,
} from "./types";

export interface ModelOptions<S extends SchemaDefinition> {
	name: string;
	type?: "many" | "one";
	unique?: string;
	schema: S;
	onCreate?: (data: any) => any;
	onUpdate?: (data: any) => any;
	onDelete?: (data: any) => any;
}

export class Model<S extends SchemaDefinition> {
	public name: string;
	public type: "many" | "one" = "many";
	public unique: string = "id";
	public schema: S;
	public driver?: Driver<any>;
	public factory?: DriverFactory<any, any>;

	private onCreate?: (data: any) => any;
	private onUpdate?: (data: any) => any;
	private onDelete?: (data: any) => any;

	constructor(nameOrOptions: string | ModelOptions<S>) {
		if (typeof nameOrOptions === "string") {
			this.name = nameOrOptions;
			this.schema = {} as S;
		} else {
			this.name = nameOrOptions.name;
			this.type = nameOrOptions.type || "many";
			this.unique = nameOrOptions.unique || "id";
			this.schema = nameOrOptions.schema;
			this.onCreate = nameOrOptions.onCreate;
			this.onUpdate = nameOrOptions.onUpdate;
			this.onDelete = nameOrOptions.onDelete;
		}
	}

	public setDriver(driver: Driver<any>, factory: DriverFactory<any, any>) {
		this.driver = driver;
		this.factory = factory;
	}

	private checkDriver() {
		if (!this.driver || !this.factory) {
			throw new Error(
				`[Model ${this.name}] Driver or Factory not set. Use KfgML to load the model.`,
			);
		}
	}

	public find(query: any): inPromise<boolean, Kfg<any, S>> {
		this.checkDriver();

		const result = this.driver?.find?.(this.schema, {
			...query,
			model: this.name,
		});

		const createInstance = (data: any) => {
			if (!data) return null;

			// Create a fresh driver instance for the record using the factory
            const recordDriver = this.factory!({}) as Driver<any>;

			const kfg = new Kfg(recordDriver, this.schema);
			kfg.hydrate(data);
			return kfg;
		};

		if (this.driver?.async) {
			return (result as Promise<any>).then(createInstance) as any;
		}
		return createInstance(result) as any;
	}

	public findBy(field: string, value: any): inPromise<boolean, Kfg<any, S>> {
		return this.find({ [field]: value });
	}

	public create(
		data: Partial<StaticSchema<S>>,
	): inPromise<boolean, Kfg<any, S>> {
		this.checkDriver();

		const result = this.driver?.create?.(this.schema, {
			...data,
			_model: this.name,
		});

		const createInstance = (data: any) => {
            const recordDriver = this.factory!({}) as Driver<any>;
			const kfg = new Kfg(recordDriver, this.schema);
			kfg.hydrate(data);
			return kfg;
		};

		if (this.driver?.async) {
			return (result as Promise<any>).then(createInstance) as any;
		}
		return createInstance(result) as any;
	}

	public update(
		id: string | number,
		data: Partial<StaticSchema<S>>,
	): inPromise<boolean, void> {
		this.checkDriver();
		return this.driver?.update?.(this.schema, id, {
			...data,
			_model: this.name,
		}) as any;
	}

	public delete(id: string | number): inPromise<boolean, void> {
		this.checkDriver();
		return this.driver?.delete?.(this.schema, id) as any;
	}
}
