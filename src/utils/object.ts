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

export function isObject(item: any): item is Record<string, any> {
	return item !== null && typeof item === "object" && !Array.isArray(item);
}

export function deepMerge<T extends object, U extends object>(
	target: T,
	source: U,
): T & U {
	const output = { ...target } as T & U;

	if (isObject(target) && isObject(source)) {
		Object.keys(source).forEach((key) => {
			const sourceValue = source[key as keyof U];
			const targetValue = target[key as keyof T];

			if (isObject(sourceValue) && isObject(targetValue)) {
				(output as any)[key] = deepMerge(
					targetValue as object,
					sourceValue as object,
				);
			} else {
				(output as any)[key] = sourceValue;
			}
		});
	}

	return output;
}

export function flattenObject(
	obj: Record<string, any>,
	prefix = "",
): Record<string, any> {
	return Object.keys(obj).reduce(
		(acc, k) => {
			const pre = prefix.length ? `${prefix}.` : "";
			if (isObject(obj[k])) {
				Object.assign(acc, flattenObject(obj[k], pre + k));
			} else {
				acc[pre + k] = obj[k];
			}
			return acc;
		},
		{} as Record<string, any>,
	);
}

export function unflattenObject(obj: Record<string, any>): Record<string, any> {
	const result = {};
	for (const key in obj) {
		setProperty(result, key, obj[key]);
	}
	return result;
}

export function deleteProperty<T extends Record<string, any>>(
	obj: T,
	path: string,
): boolean {
	const keys = path.split(".");
	const lastKey = keys.pop() as string;
	let target: any = obj;
	for (const key of keys) {
		if (target?.[key] === undefined) {
			return false;
		}
		target = target[key];
	}
	if (typeof target === "object" && target !== null) {
		return delete target[lastKey];
	}
	return false;
}
