export function getProperty<T extends Record<string, any>>(
	obj: T,
	path: string,
): any {
	return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

export function setProperty<T extends Record<string, any>>(
	obj: T,
	path: string,
	value: any,
): void {
	const keys = path.split(".");
	const lastKey = keys.pop() as string;
	let target: any = obj;
	for (const key of keys) {
		if (target[key] === undefined || target[key] === null) {
			target[key] = {};
		} else if (typeof target[key] !== "object") {
			throw new Error(`Cannot set property on non-object at path: ${key}`);
		}
		target = target[key];
	}
	target[lastKey] = value;
}
