import { kfgDriver } from "../kfg-driver";
import { flattenObject, unflattenObject } from "../utils/object";
import { loadSqliteDatabase } from "../utils/sqlite";

const KfgDatabase = await loadSqliteDatabase();

export interface SqliteDriverConfig {
	path?: string;
	table?: string;
	database?: string | any;
	parents?: any[];
	parent?: boolean;
}

interface SqliteDriverExtension {
    _db: InstanceType<typeof KfgDatabase> | null;
}

function getDb(config: SqliteDriverConfig): InstanceType<typeof KfgDatabase> {
	if (config.database && typeof config.database.prepare === "function") {
		return config.database as InstanceType<typeof KfgDatabase>;
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

export const sqliteDriver = kfgDriver<SqliteDriverConfig, SqliteDriverExtension>((config) => {
	return {
		name: "sqlite-driver",
		async: false,
		model: true,
		_db: null as InstanceType<typeof KfgDatabase> | null,

		load(schema, opts) {
			Object.assign(config, opts);
			const db = getDb(config);
			this._db = db;

			const table = config.table || "settings";
			ensureTable(db, table);

			if (config.parents) {
				for (const parent of config.parents) {
					if (parent?.driver) {
						parent.load({ database: db });
					} else if (parent && typeof parent.load === "function") {
						parent.load(schema, { database: db });
					}
				}
			}

			const rows = db.prepare(`SELECT * FROM "${table}"`).all() as any[];
			const flat: Record<string, any> = {};
			for (const row of rows) {
				const fullPath = row.group ? `${row.group}.${row.key}` : row.key;
				flat[fullPath] = rowToValue(row);
			}
			return unflattenObject(flat);
		},

		set(key, value) {
			const db = this._db;
			if (!db) return;
			const table = config.table || "settings";
			const parts = key.split(".");
			const k = parts.pop()!;
			const g = parts.join(".");
			const type = Array.isArray(value) ? "array" : typeof value;
			const valStr =
				type === "object" || type === "array"
					? JSON.stringify(value)
					: String(value);
			const now = Date.now();

			db.prepare(
				`INSERT INTO "${table}" (key, "group", type, value, create_at, update_at)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(key, "group") DO UPDATE SET
                    value = excluded.value,
                    type = excluded.type,
                    update_at = excluded.update_at`,
			).run(k, g, type, valStr, now, now);
		},

		del(key) {
			const db = this._db;
			if (!db) return;
			const table = config.table || "settings";
			const parts = key.split(".");
			const k = parts.pop()!;
			const g = parts.join(".");
			db.prepare(`DELETE FROM "${table}" WHERE key = ? AND "group" = ?`).run(
				k,
				g,
			);
		},

		find(_schema, opts) {
			const db = this._db || getDb(config);
			const table = opts.model;
			ensureTable(db, table);

			const queryKeys = Object.keys(opts).filter(
				(k) => k !== "model" && k !== "relations",
			);
			let ids: string[] = [];

			if (queryKeys.length === 0) {
				const rows = db
					.prepare(`SELECT DISTINCT "group" FROM "${table}"`)
					.all() as any[];
				ids = rows.map((r: any) => r.group.split(".")[0]).filter(Boolean);
			} else {
				const subQueries = queryKeys.map((k) => {
					const val = String(opts[k]);
					return `SELECT DISTINCT SUBSTR("group" || '.', 1, INSTR("group" || '.', '.') - 1) as id FROM "${table}" WHERE key = '${k}' AND value = '${val}'`;
				});
				const rows = db.prepare(subQueries.join(" INTERSECT ")).all() as any[];
				ids = rows.map((r: any) => r.id);
			}

			if (ids.length === 0) return null;

			const id = ids[0];
			const rows = db
				.prepare(`SELECT * FROM "${table}" WHERE "group" = ? OR "group" LIKE ?`)
				.all(id, `${id}.%`) as any[];

			const flat: Record<string, any> = {};
			for (const row of rows) {
				let g = row.group;
				if (g === id) g = "";
				else if (g.startsWith(`${id}.`)) g = g.slice(id.length + 1);

				const fullPath = g ? `${g}.${row.key}` : row.key;
				flat[fullPath] = rowToValue(row);
			}
			const data = unflattenObject(flat);
			data.id = id;
			return data;
		},

		findBy(schema, opts) {
			// @ts-ignore
			return this.find(schema, opts);
		},

		create(_schema, data) {
			const db = this._db || getDb(config);
			const table = (data as any)._model;
			ensureTable(db, table);

			const id = data.id || Math.random().toString(36).substring(2, 11);
			const flat = flattenObject(data);
			const now = Date.now();

			for (const key in flat) {
				if (key === "_model") continue;
				const parts = key.split(".");
				const k = parts.pop()!;
				const g = [id, ...parts].join(".");
				const value = flat[key];
				const type = Array.isArray(value) ? "array" : typeof value;
				const valStr =
					type === "object" || type === "array"
						? JSON.stringify(value)
						: String(value);

				db.prepare(
					`INSERT INTO "${table}" (key, "group", type, value, create_at, update_at)
                     VALUES (?, ?, ?, ?, ?, ?)`,
				).run(k, g, type, valStr, now, now);
			}
			data.id = id;
			return data;
		},

		update(_schema, id, data) {
			const db = this._db || getDb(config);
			const table = (data as any)._model;
			ensureTable(db, table);

			const flat = flattenObject(data);
			const now = Date.now();

			for (const key in flat) {
				if (key === "_model" || key === "id") continue;
				const parts = key.split(".");
				const k = parts.pop()!;
				const g = [id, ...parts].join(".");
				const value = flat[key];
				const type = Array.isArray(value) ? "array" : typeof value;
				const valStr =
					type === "object" || type === "array"
						? JSON.stringify(value)
						: String(value);

				db.prepare(
					`INSERT INTO "${table}" (key, "group", type, value, create_at, update_at)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON CONFLICT(key, "group") DO UPDATE SET
                        value = excluded.value,
                        type = excluded.type,
                        update_at = excluded.update_at`,
				).run(k, g, type, valStr, now, now);
			}
			return data;
		},

		delete(_schema, id, opts?: any) {
			const db = this._db || getDb(config);
			const table = opts?.model;
			if (!table) throw new Error("Model name not provided for delete");
			ensureTable(db, table);

			db.prepare(
				`DELETE FROM "${table}" WHERE "group" = ? OR "group" LIKE ?`,
			).run(id, `${id}.%`);
		},
	};
});