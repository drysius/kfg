import { KfgDriver } from "../kfg-driver";
import {
	deleteProperty,
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
	const rows = db.prepare(`SELECT * FROM "${table}"`).all() as any[];
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

		const db = kfg.$store.get<InstanceType<typeof KfgDatabase>>("db");
		if (!db || !opts.path) return;
		const table = kfg.$config?.table || "settings";
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

		const queue = kfg.$store.get<(() => void)[]>("queue", []);
		queue.push(() => {
			if (kfg.$config?.logs) console.log(`[SqliteDriver] Executing: ${query}`);
			db.prepare(query).run(k, g, type, valStr, now, now);
		});
		kfg.$store.set("queue", queue);
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

		const db = kfg.$store.get<InstanceType<typeof KfgDatabase>>("db");
		if (!db || !opts.path) return;
		const table = kfg.$config?.table || "settings";
		const parts = opts.path.split(".");
		const k = parts.pop()!;
		const g = parts.join(".");

		const query = `DELETE FROM "${table}" WHERE key = ? AND "group" = ?`;
		log(kfg, "Queueing delete", { key: k, group: g });

		const queue = kfg.$store.get<(() => void)[]>("queue", []);
		queue.push(() => {
			if (kfg.$config?.logs) console.log(`[SqliteDriver] Executing: ${query}`);
			db.prepare(query).run(k, g);
		});
		kfg.$store.set("queue", queue);
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
		// If cache is missing, load it first to ensure merge is correct?
		// Or just merge into what we have (if undefined, merge creates it)?
		// kfg.$store.merge handles deepMerge.
		// If "data" is undefined, deepMerge(undefined, newData) might be tricky or return newData.
		// Let's ensure data exists.
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
});
