import { KfgFS, c, cfs, jsonDriver } from "./src/index";
import * as path from "node:path";
import * as fs from "node:fs";

const licenças = new KfgFS(jsonDriver, {
	key:c.string(),
	create_at:c.number(),
	expire_in:c.number()
}, { only_importants: true });

licenças.init((id) =>
	path.join(process.cwd(), "resources/inventory", id + ".json")
);

const teste = {
	name: c.string({ default: "New User", description: "Nome do usuário" }),
	age: c.number({ default: 18, description: "Idade do usuário" }),
	is_active: c.boolean({ default: true, description: "Status de atividade do usuário" }),
	licencas_ids: cfs.many(licenças, {
		default: [],
		description: "Lista de IDs de inventário pertencentes ao usuário",
	}),
}

const UserConfigFS = new KfgFS(jsonDriver, teste, { only_importants:true });

const perfil = {
    user_id:c.string(),
    bio:c.string(),
    user:cfs.join(UserConfigFS,{
        fk:"user_id"
    })
}

const PerfilConfigFS = new KfgFS(jsonDriver,perfil, { only_importants:true })

// Inicializar o ConfigFS para Usuário, definindo como os caminhos dos arquivos serão gerados.
UserConfigFS.init((id) =>
	path.join(process.cwd(), "resources/users", id + ".json")
);

PerfilConfigFS.init((id) =>
    path.join(process.cwd(), "resources/profiles", id + ".json")
);

async function runExample() {
	console.log("Iniciando exemplo de KfgFS...");

	// Garantir que os diretórios de recursos existam
	fs.mkdirSync(path.join(process.cwd(), "resources/inventory"), { recursive: true });
	fs.mkdirSync(path.join(process.cwd(), "resources/users"), { recursive: true });
	fs.mkdirSync(path.join(process.cwd(), "resources/profiles"), { recursive: true });

	// --- Criar e gerenciar itens de Inventário ---
	console.log("\n--- Gerenciando Inventários ---");
	const inv1 = licenças.file("inv-1");
	inv1.set("key", "key-1");
	inv1.set("create_at", Date.now());
	inv1.set("expire_in", Date.now() + 1000 * 60 * 60 * 24 * 30);
	await inv1.load(); // Carrega padrões ou dados existentes
	console.log("Inventário 1 (inv-1):", await inv1.toJSON());

	const inv2 = licenças.file("inv-2");
	inv2.set("key", "key-2");
	inv2.set("create_at", Date.now());
	inv2.set("expire_in", Date.now() + 1000 * 60 * 60 * 24 * 30);
	await inv2.load();
	console.log("Inventário 2 (inv-2):", await inv2.toJSON());

	// --- Criar e gerenciar um Usuário ---
	console.log("\n--- Gerenciando Usuários ---");
	const user1 = UserConfigFS.file("user-123");

	user1.set("name", "Alice");
	user1.set("age", 30);
	user1.set("is_active", true);
	const valor = user1.get("licencas_ids")
	user1.set("licencas_ids", ["inv-1", "inv-2"]); // Atribuir inventários ao usuário

	console.log("Usuário 1 (user-123):", await user1.toJSON());

	// --- Acessando inventários relacionados usando getMany ---
	console.log("\n--- Acessando Inventários Relacionados ---");
	const user1Inventories = user1.getMany("licencas_ids");
	if (user1Inventories) {
		console.log("Inventários de Alice:");
		for (const inv of user1Inventories) {
			console.log(`  - Arquivo de Inventário: ${inv.filePath}`);
			console.log(`    Key: ${inv.get("key")}`);
			console.log(`    Created At: ${inv.get("create_at")}`);
			console.log(`    Expires In: ${inv.get("expire_in")}`);
		}
	}

	// --- Demonstrar outros métodos do ConfigFS (gerenciador) ---
	console.log("\n--- Demonstrando Métodos do Gerenciador ConfigFS ---");

	// Copiar user-123 para user-456
	console.log("Copiando user-123 para user-456...");
	UserConfigFS.copy("user-123", "user-456");
	const user2 = UserConfigFS.file("user-456");
	await user2.load();
	console.log("Usuário Copiado (user-456):", await user2.toJSON());

	// Deletar user-123
	console.log("Deletando user-123...");
	UserConfigFS.del("user-123");
	console.log("user-123 deletado.");

	// Tentar carregar user-123 (deve falhar ou carregar padrões se o arquivo sumiu)
	const deletedUser = UserConfigFS.file("user-123");
	try {
		await deletedUser.load();
		console.log("user-123 após deleção (deve ser padrão ou vazio):", await deletedUser.toJSON());
	} catch (e) {
		console.log("user-123 após deleção: Arquivo não encontrado, carregando padrões.");
	}

	// --- Acessando perfil relacionado usando getJoined ---
	console.log("\n--- Acessando Perfil Relacionado ---");
	const userProfile = PerfilConfigFS.file("profile-1");
	userProfile.set("user_id", "user-456");
	userProfile.set("bio", "Bio of user 456");
	const joinedUser = await userProfile.getJoin("user");
	if (joinedUser) {
		console.log("Usuário juntado do perfil:", await joinedUser.toJSON());
	}

	console.log("\nExemplo de ConfigFS concluído.");
}

runExample().catch(console.error);
