import * as fs from "node:fs";
import * as path from "node:path";
import { ConfigJSDriver } from "../driver";
import { getProperty } from "../utils/object";

// Recursively strips comment properties (e.g., "port:comment") from the data
// object and returns them in a flat map, keyed by their full path.
function stripComments(data: Record<string, any>): Record<string, string> {
    const comments: Record<string, string> = {};

    function recurse(currentData: Record<string, any>, prefix = '') {
        const keys = Object.keys(currentData);
        for (const key of keys) {
            if (key.endsWith(':comment')) {
                const dataKey = key.replace(/:comment$/, '');
                const commentPath = prefix ? `${prefix}.${dataKey}` : dataKey;
                comments[commentPath] = currentData[key];
                delete currentData[key];
            }
        }
        for (const key of keys) {
             if (typeof currentData[key] === 'object' && currentData[key] !== null && !key.endsWith(':comment')) {
                const nestedPrefix = prefix ? `${prefix}.${key}` : key;
                recurse(currentData[key], nestedPrefix);
            }
        }
    }
    recurse(data);
    return comments;
}


function getFilePath(config: { path?: string }): string {
	return path.resolve(process.cwd(), config.path || "config.json");
}

export const jsonDriver = new ConfigJSDriver({
	identify: "json-driver",
	async: false,
	config: { path: "config.json" },
	onLoad(schema, opts) {
        this.comments = this.comments || {};
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

        this.comments = stripComments(loadedData);

		this.store = this.deepMerge(defaultData, loadedData);
		return this.store;
	},
	onSet(key, value, options) {
        this.comments = this.comments || {};
        if (options?.description) {
            this.comments[key] = options.description;
        }

        const dataWithComments = JSON.parse(JSON.stringify(this.data));

        for (const path in this.comments) {
            const keys = path.split('.');
            const propName = keys.pop() as string;
            const parentPath = keys.join('.');
            const parentObject = parentPath ? getProperty(dataWithComments, parentPath) : dataWithComments;
            if (typeof parentObject === 'object' && parentObject !== null) {
                parentObject[`${propName}:comment`] = this.comments[path];
            }
        }

		const filePath = getFilePath(this.config);
		fs.writeFileSync(filePath, JSON.stringify(dataWithComments, null, 2));
	},
});
