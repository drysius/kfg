import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigJSDriver } from "../driver";
import { getProperty, setProperty } from "../utils/object";

function getFilePath(config: { path?: string }): string {
	return path.resolve(process.cwd(), config.path || "config.json");
}

export const jsonDriver = new ConfigJSDriver({
	identify: "json-driver",
	async: false,
	config: { path: "config.json" },
	getEnvKeyForPath: (path) => path,
	onLoad() {
		this.store = {}; // Reset store
		const filePath = getFilePath(this.config);
		if (!fs.existsSync(filePath)) {
			return;
		}
		const fileContent = fs.readFileSync(filePath, "utf-8");
		this.store = JSON.parse(fileContent);
	},
	onGet(key) {
		return getProperty(this.store, key);
	},
	onSet(key, value) {
		setProperty(this.store, key, value);
		const filePath = getFilePath(this.config);
		fs.writeFileSync(filePath, JSON.stringify(this.store, null, 2));
	},
});
