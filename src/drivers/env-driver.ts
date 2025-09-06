import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigJSDriver } from "../driver";
import { parse, updateEnvContent } from "../utils/env";

function getFilePath(config: { path?: string }): string {
	return path.resolve(process.cwd(), config.path || ".env");
}

export const envDriver = new ConfigJSDriver({
	identify: "env-driver",
	async: false,
	config: { path: ".env" },
	onLoad() {
		this.store = {}; // Reset store
		const filePath = getFilePath(this.config);
		if (!fs.existsSync(filePath)) return;
		const fileContent = fs.readFileSync(filePath, "utf-8");
		this.store = parse(fileContent);
	},
	onGet(key) {
		return this.store[key];
	},
	onSet(key, value, options) {
		this.store[key] = value;
		const filePath = getFilePath(this.config);
		const currentContent = fs.existsSync(filePath)
			? fs.readFileSync(filePath, "utf-8")
			: "";
		const newContent = updateEnvContent(
			currentContent,
			key,
			value,
			options?.description,
		);
		fs.writeFileSync(filePath, newContent);
	},
});
