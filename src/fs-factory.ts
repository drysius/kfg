import { Type } from "@sinclair/typebox";
import type { ConfigFS, FileFSConfigJS } from "./ConfigFS";
import type { SchemaOptions } from "./types";

export const CFS_MANY_SYMBOL = Symbol.for("ConfigFS.many");
export const CFS_JOIN_SYMBOL = Symbol.for("ConfigFS.join");

const _cfs = {
	many: <T extends ConfigFS<any, any>>(configFs: T, options?: SchemaOptions) =>
		Type.Unsafe<FileFSConfigJS<T["driver"], T["schema"]>[]>(
			Type.Array(Type.String(), {
				...options,
				[CFS_MANY_SYMBOL]: {
					configFs,
				},
			}),
		),
	join: <T extends ConfigFS<any, any>>(
		configFs: T,
		options?: SchemaOptions & { fk: string },
	) =>
		Type.Unsafe<FileFSConfigJS<T["driver"], T["schema"]>>(
			Type.Object(
				{},
				{
					...options,
					[CFS_JOIN_SYMBOL]: {
						configFs,
						fk: options?.fk,
					},
				},
			),
		),
};

export const cfs = {
	..._cfs,
};
