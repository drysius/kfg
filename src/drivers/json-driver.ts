import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigJSDriver } from "../driver";

function getFilePath(config: { path?: string }): string {
	return path.resolve(process.cwd(), config.path || "config.json");
}

export const jsonDriver = new ConfigJSDriver({
	identify: "json-driver",
	async: false,
	config: { path: "config.json" },
	onLoad(schema, opts) {
		const defaultData = this.buildDefaultObject(schema);
		const filePath = getFilePath(this.config);

		let loadedData = {};
		if (fs.existsSync(filePath)) {
			try {
				const fileContent = fs.readFileSync(filePath, "utf-8");
				if (fileContent) {
					loadedData = JSON.parse(fileContent);
				}
			} catch (e) { /* Ignore */ }
		}

		this.store = this.deepMerge(defaultData, loadedData);
		return this.store;
	},
	onSet(key, value) {
		const filePath = getFilePath(this.config);
		fs.writeFileSync(filePath, JSON.stringify(this.data, null, 2));
	},
});