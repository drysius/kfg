import type { Statement } from "bun:sqlite";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

type BunSqlite = typeof import("bun:sqlite").Database;
type NodeSqlite = typeof import("node:sqlite").DatabaseSync;
type BetterSqlite = typeof import("better-sqlite3");

export async function loadSqliteDatabase() {
	const firsttry = typeof Bun !== "undefined" ? "bun:sqlite" : "node:sqlite";
	let sqlite: BunSqlite | NodeSqlite | BetterSqlite;
	let moduleType: string;

	try {
		if (firsttry === "bun:sqlite") {
			const m = await import("bun:sqlite");
			sqlite = m.Database;
			moduleType = "bun:sqlite";
		} else {
			const m = await import("node:sqlite");
			sqlite = m.DatabaseSync;
			moduleType = "node:sqlite";
		}
	} catch {
		try {
			// not supported use module better-sqlite3
			const m = await import("better-sqlite3");
			sqlite = m?.default || m;
			moduleType = "better-sqlite3";
		} catch {
			throw new Error(
				"Bun, node and better-sqlite3 database not found, update your environment",
			);
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

		close() {
			this.db.close();
		}
	};
}
