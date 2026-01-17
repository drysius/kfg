import type { Driver, DriverConfig, inPromise } from "./types";

/**
 * The base class for all drivers.
 * @template C The type of the driver configuration.
 * @template Async The type of the async flag.
 */
export class KfgDriver<C extends DriverConfig, Async extends boolean>
	implements Driver<Async, C>
{
	public readonly identify: string;
	public readonly async;
	public config: C;

	// Hooks from the Driver interface
	public onMount?: Driver<Async, C>["onMount"];
	public onUnmount?: Driver<Async, C>["onUnmount"];
	public onRequest?: Driver<Async, C>["onRequest"];
	public onGet?: Driver<Async, C>["onGet"];
	public onUpdate?: Driver<Async, C>["onUpdate"];
	public onDelete?: Driver<Async, C>["onDelete"];
	public onMerge?: Driver<Async, C>["onMerge"];
	public onHas?: Driver<Async, C>["onHas"];
	public onInject?: Driver<Async, C>["onInject"];
	public onToJSON?: Driver<Async, C>["onToJSON"];
	public save?: Driver<Async, C>["save"];
	public onCreate?: Driver<Async, C>["onCreate"];
	public onList?: Driver<Async, C>["onList"];
	public onSize?: Driver<Async, C>["onSize"];

	/**
	 * Creates a new instance of KfgDriver.
	 * @param definition The driver definition.
	 */
	constructor(public readonly definition: Driver<Async, C>) {
		this.identify = definition.identify;
		this.async = definition.async;
		this.config = (definition.config || {}) as C;

		this.onMount = definition.onMount;
		this.onUnmount = definition.onUnmount;
		this.onRequest = definition.onRequest;
		this.onGet = definition.onGet;
		this.onUpdate = definition.onUpdate;
		this.onDelete = definition.onDelete;
		this.onMerge = definition.onMerge;
		this.onHas = definition.onHas;
		this.onInject = definition.onInject;
		this.onToJSON = definition.onToJSON;
		this.save = definition.save;
		this.onCreate = definition.onCreate;
		this.onList = definition.onList;
		this.onSize = definition.onSize;
	}

	/**
	 * Mounts the driver.
	 */
	public mount(kfg: any, opts?: any): inPromise<Async, any> {
		if (opts) {
			kfg.$store.set("~driver", { ...this.config, ...opts });
		}
		if (this.onMount) {
			return this.onMount(kfg, opts);
		}
		return (this.async ? Promise.resolve() : undefined) as any;
	}

	/**
	 * Unmounts the driver.
	 */
	public unmount(kfg: any): void {
		if (this.onUnmount) {
			this.onUnmount(kfg);
		}
	}

	/**
	 * Called before an operation.
	 */
	public request(kfg: any, opts: any): inPromise<Async, void> {
		if (this.onRequest) {
			return this.onRequest(kfg, opts);
		}
		return (this.async ? Promise.resolve() : undefined) as any;
	}

	public get(kfg: any, key?: string): inPromise<Async, any> {
		const run = () => {
			if (this.onGet) {
				return this.onGet(kfg, { path: key });
			}
			throw new Error("Driver does not implement onGet");
		};

		if (this.async) {
			return (this.request(kfg, { path: key }) as Promise<void>).then(
				run,
			) as any;
		}
		this.request(kfg, { path: key });
		return run() as any;
	}

	public set(
		kfg: any,
		key: string,
		value: any,
		options?: { description?: string },
	): inPromise<Async, void> {
		const run = () => {
			if (this.onUpdate) {
				return this.onUpdate(kfg, { path: key, value, ...options });
			}
			throw new Error("Driver does not implement onUpdate");
		};

		if (this.async) {
			return (
				this.request(kfg, { path: key, value, ...options }) as Promise<void>
			).then(run) as any;
		}
		this.request(kfg, { path: key, value, ...options });
		return run() as any;
	}

	public has(kfg: any, ...keys: string[]): inPromise<Async, boolean> {
		const run = () => {
			if (this.onHas) {
				return this.onHas(kfg, { paths: keys });
			}
			throw new Error("Driver does not implement onHas");
		};

		if (this.async) {
			return (this.request(kfg, { paths: keys }) as Promise<void>).then(
				run,
			) as any;
		}
		this.request(kfg, { paths: keys });
		return run() as any;
	}

	public del(kfg: any, key: string, options?: any): inPromise<Async, void> {
		const run = () => {
			if (this.onDelete) {
				return this.onDelete(kfg, { path: key, ...options });
			}
			throw new Error("Driver does not implement onDelete");
		};

		if (this.async) {
			return (
				this.request(kfg, { path: key, ...options }) as Promise<void>
			).then(run) as any;
		}
		this.request(kfg, { path: key, ...options });
		return run() as any;
	}

	public saveTo(kfg: any, data?: any): inPromise<Async, void> {
		const run = () => {
			if (this.save) {
				return this.save(kfg, data);
			}
			// save is optional
		};
		if (this.async) {
			return (this.request(kfg, { data }) as Promise<void>).then(run) as any;
		}
		this.request(kfg, { data });
		return run() as any;
	}

	public insert(kfg: any, path: string, partial: any): inPromise<Async, void> {
		const run = (target: any) => {
			if (typeof target !== "object" || target === null) {
				throw new Error(`Cannot insert into non-object at path: ${path}`);
			}
			Object.assign(target, partial);
			return this.set(kfg, path, target);
		};

		const result = this.get(kfg, path);
		if (this.async) {
			return (result as Promise<any>).then(run) as any;
		}
		return run(result) as any;
	}

	public inject(kfg: any, data: any): inPromise<Async, void> {
		const run = () => {
			if (this.onMerge) {
				return this.onMerge(kfg, { data });
			}
			if (this.onInject) {
				return this.onInject(kfg, { data });
			}
			throw new Error("Driver does not implement onMerge/onInject");
		};

		if (this.async) {
			return (this.request(kfg, { data }) as Promise<void>).then(run) as any;
		}
		this.request(kfg, { data });
		return run() as any;
	}

	public toJSON(kfg: any): inPromise<Async, any> {
		const run = () => {
			if (this.onToJSON) {
				return this.onToJSON(kfg);
			}
			throw new Error("Driver does not implement onToJSON");
		};
		if (this.async) {
			return (this.request(kfg, {}) as Promise<void>).then(run) as any;
		}
		this.request(kfg, {});
		return run() as any;
	}

	public create(kfg: any, data: any): inPromise<Async, any> {
		const run = () => {
			if (this.onCreate) {
				return this.onCreate(kfg, { data });
			}
			throw new Error("Driver does not implement onCreate");
		};
		if (this.async) {
			return (this.request(kfg, { data }) as Promise<void>).then(run) as any;
		}
		this.request(kfg, { data });
		return run() as any;
	}

	public list(kfg: any, opts?: any): inPromise<Async, any> {
		const run = () => {
			if (this.onList) {
				return this.onList(kfg, opts);
			}
			throw new Error("Driver does not implement onList");
		};
		if (this.async) {
			return (this.request(kfg, opts) as Promise<void>).then(run) as any;
		}
		this.request(kfg, opts);
		return run() as any;
	}

	public size(kfg: any): number {
		if (this.onSize) {
			return this.onSize(kfg);
		}
		// Default implementation if onSize not provided?
		// We can try to get data and count keys if in store?
		// But explicit is better.
		return 0;
	}
}
