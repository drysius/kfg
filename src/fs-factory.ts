import { Type } from "@sinclair/typebox";
import type { KfgFS, KfgFileFS } from "./kfg-fs";
import type { SchemaOptions } from "./types";

/**
 * A symbol used to identify a many-to-many relation in a schema.
 */
export const KFS_MANY_SYMBOL = Symbol.for("Kfg.many");
/**
 * A symbol used to identify a one-to-one relation in a schema.
 */
export const KFS_JOIN_SYMBOL = Symbol.for("Kfg.join");

const _cfs = {
	/**
	 * Creates a many-to-many relation in a schema.
	 * @param kfgFs The KfgFS instance to relate to.
	 * @param options The schema options.
	 */
	many: <T extends KfgFS<any, any>>(kfgFs: T, options?: SchemaOptions) =>
		Type.Unsafe<KfgFileFS<T["driver"], T["schema"]>[]>(
			Type.Array(Type.String(), {
				...options,
				[KFS_MANY_SYMBOL]: {
					kfgFs,
				},
			}),
		),
	join: <T extends KfgFS<any, any>>(
		kfgFs: T,
		options?: SchemaOptions & { fk: string },
	) =>
		Type.Unsafe<KfgFileFS<T["driver"], T["schema"]>>(
			Type.Object(
				{},
				{
					...options,
					[KFS_JOIN_SYMBOL]: {
						kfgFs,
						fk: options?.fk,
					},
				},
			),
		),
};

export const cfs = {
	..._cfs,
};
export const kfs = cfs;