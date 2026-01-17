import type { Statement } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type BunSqlite = typeof import("bun:sqlite").Database;
type NodeSqlite = typeof import("node:sqlite").DatabaseSync;
type BetterSqlite = typeof import("better-sqlite3");

function loadSqliteDatabase() {
	const firsttry = typeof Bun !== "undefined" ? "bun:sqlite" : "node:sqlite";
	let sqlite: BunSqlite | NodeSqlite | BetterSqlite;
	let moduleType: string;

	if (firsttry === "bun:sqlite") {
		try {
			const m = require("bun:sqlite");
			sqlite = m.Database;
			moduleType = "bun:sqlite";
		} catch {
			try {
				const m = require("better-sqlite3");
				sqlite = m?.default || m;
				moduleType = "better-sqlite3";
			} catch {
				throw new Error(
					"Bun and better-sqlite3 database not found, update your environment",
				);
			}
		}
	} else {
		try {
			const m = require("node:sqlite");
			sqlite = m.DatabaseSync;
			moduleType = "node:sqlite";
		} catch {
			try {
				const m = require("better-sqlite3");
				sqlite = m?.default || m;
				moduleType = "better-sqlite3";
			} catch {
				throw new Error(
					"Node and better-sqlite3 database not found, update your environment",
				);
			}
		}
	}

	return class KfgDatabase {
		db:
			| InstanceType<BunSqlite | NodeSqlite>
			| import("better-sqlite3").Database;
		module_type: string;

		constructor(path: string) {
			this.module_type = moduleType;
			const dir = dirname(path);
			if (!existsSync(dir) && path !== ":memory:") {
				mkdirSync(dir, { recursive: true });
			}

			this.db = new sqlite(path);
		}

		exec(sql: string): void {
			this.db.exec(sql);
		}

		prepare(sql: string) {
			const stmt = (this.db as any).prepare(sql) as Statement;

			return {
				all: (...params: any[]) => {
					return stmt.all(...params);
				},
				get: (...params: any[]) => {
					return stmt.get(...params);
				},
				run: (...params: any[]) => {
					return stmt.run(...params);
				},
				finalize: () => {
					if ("finalize" in stmt) stmt.finalize();
				},
			};
		}

		transaction(fn: () => void) {
			const db = this.db as any;
			if (typeof db.transaction === "function") {
				return db.transaction(fn);
			}
			return () => {
				this.exec("BEGIN");
				try {
					fn();
					this.exec("COMMIT");
				} catch (e) {
					this.exec("ROLLBACK");
					throw e;
				}
			};
		}
		close() {
			this.db.close();
		}
	};
}
const KfgDatabase = loadSqliteDatabase();
export default KfgDatabase;
