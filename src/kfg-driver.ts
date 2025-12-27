import { Value } from "@sinclair/typebox/value";
import type {
	Driver,
	DriverConfig,
	DriverFactory,
	SchemaDefinition,
	inPromise,
} from "./types";
import {
	deepMerge,
	deleteProperty,
	getProperty,
	setProperty,
} from "./utils/object";
import { addSmartDefaults, buildTypeBoxSchema } from "./utils/schema";

type DriverImplementation = Omit<
	Driver<any>,
	"load" | "set" | "del" | "has" | "inject" | "get">
&
	Partial<
		Pick<Driver<any>, "load" | "set" | "del" | "has" | "inject" | "get">
	>;

/**
 * Creates a new Kfg Driver factory.
 * @param factory The factory function that initializes the driver logic.
 */
export function kfgDriver< 
	C extends DriverConfig = any,
	T extends Record<string, any> = {},
>(
	factory: (opts: Partial<C>) => T & DriverImplementation,
): DriverFactory<C, any> {
	return (config: Partial<C>) => {
		const partialDriver = factory(config);
		const async = partialDriver.async;
		let _data: any = {};

		const driver: Driver<any> & T = {
			...partialDriver,

			load(schema: SchemaDefinition, opts?: any): inPromise<boolean, any> {
				const validate = (data: any) => {
					const compiledSchema = buildTypeBoxSchema(schema);
					addSmartDefaults(compiledSchema);
					const configWithDefaults = Value.Default(compiledSchema, data) as any;
					Value.Convert(compiledSchema, configWithDefaults);

					if (!Value.Check(compiledSchema, configWithDefaults)) {
						const errors = [
							...Value.Errors(compiledSchema, configWithDefaults),
						];
						throw new Error(
							`[Kfg] Validation failed:\n${errors
								.map((e) => `- ${e.path}: ${e.message}`)
								.join("\n")}`,
						);
					}
					return configWithDefaults;
				};

				const runLoad = () => {
					if (partialDriver.load) {
						const result = partialDriver.load.call(driver, schema, opts);
						if (async) {
							return (result as Promise<any>).then((res) => {
								const validated = validate(res);
								_data = validated;
								return validated;
							}) as any;
						}
						const validated = validate(result);
						_data = validated;
						return validated;
					}
					return (
						async ? Promise.resolve(validate(_data)) : validate(_data)
					) as any;
				};

				if (partialDriver.onRequest) {
					const req = partialDriver.onRequest.call(driver);
					if (async) return (req as Promise<void>).then(() => runLoad());
					return runLoad();
				}
				return runLoad();
			},

			get(key?: string): inPromise<boolean, any> {
				const runGet = () => {
					if (partialDriver.get) return partialDriver.get.call(driver, key);
					if (!key) return _data;
					return getProperty(_data, key);
				};
				if (partialDriver.onRequest) {
					const req = partialDriver.onRequest.call(driver);
					if (async) return (req as Promise<void>).then(() => runGet());
					return runGet();
				}
				return runGet();
			},

			set(key: string, value: any, options?: any): inPromise<boolean, void> {
				const runSet = () => {
					setProperty(_data, key, value);
					if (partialDriver.set) {
						return partialDriver.set.call(driver, key, value, options);
					}
					return (async ? Promise.resolve() : undefined) as any;
				};

				if (partialDriver.onRequest) {
					const req = partialDriver.onRequest.call(driver);
					if (async) return (req as Promise<void>).then(() => runSet());
					return runSet();
				}
				return runSet();
			},

			has(...keys: string[]): inPromise<boolean, boolean> {
				const runHas = () => {
					if (partialDriver.has) return partialDriver.has.call(driver, ...keys);
					return keys.every((key) => getProperty(_data, key) !== undefined);
				};
				if (partialDriver.onRequest) {
					const req = partialDriver.onRequest.call(driver);
					if (async) return (req as Promise<void>).then(() => runHas());
					return runHas();
				}
				return runHas();
			},

			del(key: string, options?: any): inPromise<boolean, void> {
				const runDel = () => {
					deleteProperty(_data, key);
					if (partialDriver.del) {
						return partialDriver.del.call(driver, key, options);
					}
					return (async ? Promise.resolve() : undefined) as any;
				};

				if (partialDriver.onRequest) {
					const req = partialDriver.onRequest.call(driver);
					if (async) return (req as Promise<void>).then(() => runDel());
					return runDel();
				}
				return runDel();
			},

			inject(data: any): inPromise<boolean, void> {
				const runInject = () => {
					_data = deepMerge(_data, data);
					if (partialDriver.inject)
						return partialDriver.inject.call(driver, data);
					return (async ? Promise.resolve() : undefined) as any;
				};
				if (partialDriver.onRequest) {
					const req = partialDriver.onRequest.call(driver);
					if (async) return (req as Promise<void>).then(() => runInject());
					return runInject();
				}
				return runInject();
			},

			unmount() {
				if (partialDriver.unmount) {
					partialDriver.unmount.call(driver);
				}
			},
		} as Driver<any> & T;

		return driver;
	};
}

// For compatibility if needed
export type KfgDriver<_C, _S, _A> = Driver<boolean>;