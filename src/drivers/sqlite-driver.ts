import { Kfg } from "../kfg";
import { KfgDriver } from "../kfg-driver";
import {
	deleteProperty,
	flattenObject,
	getProperty,
	setProperty,
	unflattenObject,
} from "../utils/object";
import KfgDatabase from "../utils/sqlite";

export interface SqliteDriverConfig {
	path?: string;
	table?: string;
	database?: string | any;
	logs?: boolean;
}

function getDb(config: SqliteDriverConfig): InstanceType<typeof KfgDatabase> {
	if (config.database && typeof config.database.prepare === "function") {
		return config.database;
	}
	return new KfgDatabase(config.database || config.path || "config.db");
}

function ensureTable(db: any, table: string) {
	db.exec(`
        CREATE TABLE IF NOT EXISTS "${table}" (
            key TEXT,
            "group" TEXT,
            type TEXT,
            value TEXT,
            create_at INTEGER,
            update_at INTEGER,
            PRIMARY KEY (key, "group")
        )
    `);
}

function rowToValue(row: any) {
	let val = row.value;
	if (row.type === "number") val = Number(val);
	else if (row.type === "boolean") val = val === "true";
	else if (row.type === "object" || row.type === "array") {
		try {
			val = JSON.parse(val);
		} catch {
			/* ignore */
		}
	}
	return val;
}

function loadData(kfg: any) {
	const db = kfg.$store.get("db");
	const table = kfg.$config?.table || "settings";
	const stmt = db.prepare(`SELECT * FROM "${table}"`);
	const rows = stmt.all() as any[];
	stmt.finalize();
	const flat: Record<string, any> = {};
	for (const row of rows) {
		const fullPath = row.group ? `${row.group}.${row.key}` : row.key;
		flat[fullPath] = rowToValue(row);
	}
	const finalData = unflattenObject(flat);
	kfg.$store.set("data", finalData);
	return finalData;
}

function touch(kfg: any) {
	kfg.$store.set("lastAccess", Date.now());
}

function log(kfg: any, message: string, ...args: any[]) {
	if (kfg.$config?.logs) {
		console.log(`[SqliteDriver] ${message}`, ...args);
	}
}

function queueQuery(kfg: Kfg<any,any,any>, query: string, ...params: any[]) {
	const db = kfg.$store.get<InstanceType<typeof KfgDatabase>>("db");
	if (!db) return;
	const queue = kfg.$store.get<(() => void)[]>("queue", []);
	queue.push(() => {
		if (kfg.$config?.logs) console.log(`[SqliteDriver] Executing: ${query}`);
		const stmt = db.prepare(query);
		stmt.run(...params);
		stmt.finalize();
	});
	kfg.$store.set("queue", queue);
}

// --- Driver Implementation ---

export const SqliteDriver = new KfgDriver<SqliteDriverConfig, false>({
	identify: "sqlite-driver",
	async: false,
	config: {
		logs: false,
	},
	onMount(kfg, _opts) {
		const cfg = kfg.$config;
		const db = getDb(cfg);
		kfg.$store.set("db", db);
		kfg.$store.set("queue", []);
		touch(kfg);

		const table = cfg.table || "settings";
		ensureTable(db, table);

		// Cache expiration logic
		const interval = setInterval(() => {
			const lastAccess = kfg.$store.get("lastAccess", 0);
			if (Date.now() - lastAccess > 5000) {
				const data = kfg.$store.get("data");
				if (data) {
					log(kfg, "Clearing cache due to inactivity");
					kfg.$store.set("data", undefined);
				}
			}
		}, 1000); // Check every second
		kfg.$store.set("interval", interval);

		return loadData(kfg);
	},

	onUnmount(kfg) {
		this.save?.(kfg as never);
		const interval = kfg.$store.get<number>("interval");
		if (interval) clearInterval(interval);
		const db = kfg.$store.get<InstanceType<typeof KfgDatabase>>("db");
		if (db?.close) db.close();
	},

	onGet(kfg, { path }) {
		touch(kfg);
		let data = kfg.$store.get<Record<string, any>>("data");
		if (!data) {
			log(kfg, "Cache miss, reloading data");
			data = loadData(kfg);
		}
		if (!path) return data;
		return getProperty(data, path);
	},

	onHas(kfg, { paths }) {
		touch(kfg);
		let data = kfg.$store.get<Record<string, any>>("data");
		if (!data) {
			log(kfg, "Cache miss, reloading data");
			data = loadData(kfg);
		}
		return paths.every((path: string) => getProperty(data, path) !== undefined);
	},

	onUpdate(kfg, opts) {
		touch(kfg);
		let data = kfg.$store.get<Record<string, any>>("data");
		if (!data) {
			data = loadData(kfg);
		}
		if (opts.path) {
			setProperty(data, opts.path, opts.value);
		}
		kfg.$store.set("data", data);

		const table = kfg.$config?.table || "settings";

		if (kfg.multimode) {
			const parts = opts.path.split(".");
			const id = parts[0];

			// If updating an item (root object in multimode)
			if (parts.length === 1) {
				const value = opts.value;
				const flat = flattenObject(value);
				for (const key in flat) {
					const val = flat[key];
					const type = Array.isArray(val) ? "array" : typeof val;
					const valStr =
						type === "object" || type === "array"
							? JSON.stringify(val)
							: String(val);
					const now = Date.now();

					const query = `INSERT INTO "${table}" (key, "group", type, value, create_at, update_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(key, "group") DO UPDATE SET
                            value = excluded.value,
                            type = excluded.type,
                            update_at = excluded.update_at`;
					queueQuery(kfg, query, key, id, type, valStr, now, now);
				}
				return;
			} else {
				// Partial update
				const subKey = parts.slice(1).join(".");
				const value = opts.value;
				const flat = flattenObject(value); // keys are relative to value

				if (
					typeof value !== "object" ||
					value === null ||
					Array.isArray(value)
				) {
					const key = subKey;
					const val = value;
					const type = Array.isArray(val) ? "array" : typeof val;
					const valStr =
						type === "object" || type === "array"
							? JSON.stringify(val)
							: String(val);
					const now = Date.now();

					const query = `INSERT INTO "${table}" (key, "group", type, value, create_at, update_at)
                        VALUES (?, ?, ?, ?, ?, ?)
                        ON CONFLICT(key, "group") DO UPDATE SET
                            value = excluded.value,
                            type = excluded.type,
                            update_at = excluded.update_at`;
					queueQuery(kfg, query, key, id, type, valStr, now, now);
				} else {
					// Object
					for (const k in flat) {
						const combinedKey = subKey + (k ? `.${k}` : "");
						const val = flat[k];
						const type = Array.isArray(val) ? "array" : typeof val;
						const valStr =
							type === "object" || type === "array"
								? JSON.stringify(val)
								: String(val);
						const now = Date.now();

						const query = `INSERT INTO "${table}" (key, "group", type, value, create_at, update_at)
                            VALUES (?, ?, ?, ?, ?, ?)
                            ON CONFLICT(key, "group") DO UPDATE SET
                                value = excluded.value,
                                type = excluded.type,
                                update_at = excluded.update_at`;
						queueQuery(kfg, query, combinedKey, id, type, valStr, now, now);
					}
				}
				return;
			}
		}

		const parts = opts.path.split(".");
		const k = parts.pop()!;
		const g = parts.join(".");
		const value = opts.value;
		const type = Array.isArray(value) ? "array" : typeof value;
		const valStr =
			type === "object" || type === "array"
				? JSON.stringify(value)
				: String(value);
		const now = Date.now();

		const query = `INSERT INTO "${table}" (key, "group", type, value, create_at, update_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON CONFLICT(key, "group") DO UPDATE SET
                        value = excluded.value,
                        type = excluded.type,
                        update_at = excluded.update_at`;

		log(kfg, "Queueing update", { key: k, group: g, value: valStr });
		queueQuery(kfg, query, k, g, type, valStr, now, now);
	},

	onDelete(kfg, opts) {
		touch(kfg);
		let data = kfg.$store.get<Record<string, any>>("data");
		if (!data) {
			data = loadData(kfg);
		}
		if (opts.path) {
			deleteProperty(data, opts.path);
		}
		kfg.$store.set("data", data);

		const table = kfg.$config?.table || "settings";
		const parts = opts.path.split(".");

		if (kfg.multimode && parts.length === 1) {
			// Deleting an item
			const id = parts[0];
			const query = `DELETE FROM "${table}" WHERE "group" = ?`;
			log(kfg, "Queueing group delete", { group: id });
			queueQuery(kfg, query, id);
			return;
		}

		const k = parts.pop()!;
		const g = parts.join(".");

		const query = `DELETE FROM "${table}" WHERE key = ? AND "group" = ?`;
		log(kfg, "Queueing delete", { key: k, group: g });
		queueQuery(kfg, query, k, g);
	},

	onCreate(kfg, { data }) {
		touch(kfg);
		// Multimode create
		const id = data.id;
		if (!id) throw new Error("Cannot create item without 'id'.");

		let storeData = kfg.$store.get<Record<string, any>>("data");
		if (!storeData) {
			storeData = loadData(kfg);
		}
		storeData[id] = data;
		kfg.$store.set("data", storeData);

		const table = kfg.$config?.table || "settings";
		const flat = flattenObject(data);
		const now = Date.now();

		for (const key in flat) {
			const val = flat[key];
			const type = Array.isArray(val) ? "array" : typeof val;
			const valStr =
				type === "object" || type === "array"
					? JSON.stringify(val)
					: String(val);

			const query = `INSERT INTO "${table}" (key, "group", type, value, create_at, update_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(key, "group") DO UPDATE SET
                    value = excluded.value,
                    type = excluded.type,
                    update_at = excluded.update_at`;
			queueQuery(kfg, query, key, id, type, valStr, now, now);
		}

		// Let's stick to queue.
		// Update: We want persistence immediately for consistency.
		kfg.save();
		return data;
	},

	onToJSON(kfg) {
		touch(kfg);
		let data = kfg.$store.get("data");
		if (!data) {
			data = loadData(kfg);
		}
		return data;
	},

	onInject(kfg, { data }) {
		touch(kfg);
		let currentData = kfg.$store.get<Record<string, any>>("data");
		if (!currentData) {
			currentData = loadData(kfg);
		}
		kfg.$store.merge("data", data);
	},

	onMerge(kfg, { data }) {
		touch(kfg);
		let currentData = kfg.$store.get("data");
		if (!currentData) {
			currentData = loadData(kfg);
		}
		kfg.$store.merge("data", data);
	},

	save(kfg) {
		touch(kfg);
		const db = kfg.$store.get<InstanceType<typeof KfgDatabase>>("db");
		const queue = kfg.$store.get<(() => void)[]>("queue", []);
		if (!db || queue.length === 0) return;

		log(kfg, `Saving ${queue.length} changes`);

		const transaction = db.transaction(() => {
			for (const query of queue) {
				query();
			}
		});

		transaction();
		kfg.$store.set("queue", []);
	},

	onSize(kfg) {
		touch(kfg);
		const data = kfg.$store.get("data");
		if (!data) return 0;
		if (kfg.multimode) return Object.keys(data).length;
		return 1;
	},
});

export const AsyncSqliteDriver = new KfgDriver<SqliteDriverConfig, true>({
	identify: "async-sqlite-driver",
	async: true,
	config: { logs: false },
	onMount(kfg, opts) {
		return Promise.resolve(SqliteDriver.mount(kfg, opts));
	},
	onUnmount(kfg) {
		SqliteDriver.unmount?.(kfg);
	},
	onGet(kfg, opts) {
		return Promise.resolve(SqliteDriver.get(kfg, opts.path));
	},
	onHas(kfg, opts) {
		return Promise.resolve(SqliteDriver.has(kfg, ...opts.paths));
	},
	onUpdate(kfg, opts) {
		return Promise.resolve(SqliteDriver.definition.onUpdate!(kfg as never, opts));
	},
	onDelete(kfg, opts) {
		return Promise.resolve(SqliteDriver.definition.onDelete!(kfg as never, opts));
	},
	onCreate(kfg, opts) {
		return Promise.resolve(SqliteDriver.definition.onCreate!(kfg as never, opts));
	},
	save(kfg, data) {
		return Promise.resolve(SqliteDriver.save!(kfg as never, data));
	},
	onToJSON(kfg) {
		return Promise.resolve(SqliteDriver.toJSON(kfg));
	},
	onInject(kfg, opts) {
		return Promise.resolve(SqliteDriver.inject(kfg, opts.data));
	},
	onMerge(kfg, opts) {
		return Promise.resolve(SqliteDriver.definition.onMerge!(kfg as never, opts));
	},
	onSize(kfg) {
		return SqliteDriver.definition.onSize!(kfg as never);
	},
});
// Fix AsyncSqliteDriver onMerge to call onMerge
AsyncSqliteDriver.definition.onMerge = (kfg, opts) => {
	return Promise.resolve(SqliteDriver.definition.onMerge!(kfg as never, opts));
};
