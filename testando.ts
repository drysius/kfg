import { ConfigFS, c, cfs, jsonDriver } from "./src/index";
import * as path from "node:path";
import * as fs from "node:fs";

// 1. Definir o ConfigFS para Inventário
// Cada instância de inventário será um arquivo JSON separado.
const InventoryConfigFS = new ConfigFS(jsonDriver, {
	item: c.array(c.string(), { default: [], description: "Lista de itens no inventário" }),
	location: c.string({ default: "warehouse", description: "Localização do inventário" }),
});

// Inicializar o ConfigFS para Inventário, definindo como os caminhos dos arquivos serão gerados.
InventoryConfigFS.init((id) =>
	path.join(process.cwd(), "resources/inventory", id + ".json")
);

// 2. Definir o ConfigFS para Usuário
// Cada instância de usuário será um arquivo JSON separado.
const UserConfigFS = new ConfigFS(jsonDriver, {
	name: c.string({ default: "New User", description: "Nome do usuário" }),
	age: c.number({ default: 18, description: "Idade do usuário" }),
	is_active: c.boolean({ default: true, description: "Status de atividade do usuário" }),
	// Usar cfs.many para definir um relacionamento 'to-many' com InventoryConfigFS.
	// O campo 'inventory_ids' armazenará um array de IDs de inventário.
	inventory_ids: cfs.many(InventoryConfigFS, {
		default: [],
		description: "Lista de IDs de inventário pertencentes ao usuário",
	}),
});

// Inicializar o ConfigFS para Usuário, definindo como os caminhos dos arquivos serão gerados.
UserConfigFS.init((id) =>
	path.join(process.cwd(), "resources/users", id + ".json")
);

async function runExample() {
	console.log("Iniciando exemplo de ConfigFS...");

	// Garantir que os diretórios de recursos existam
	fs.mkdirSync(path.join(process.cwd(), "resources/inventory"), { recursive: true });
	fs.mkdirSync(path.join(process.cwd(), "resources/users"), { recursive: true });

	// --- Criar e gerenciar itens de Inventário ---
	console.log("\n--- Gerenciando Inventários ---");
	const inv1 = InventoryConfigFS.file("inv-1");
	await inv1.load(); // Carrega padrões ou dados existentes
	inv1.set("item", ["espada", "escudo"]);
	inv1.set("location", "arsenal");
	console.log("Inventário 1 (inv-1):", await inv1.toJSON());

	const inv2 = InventoryConfigFS.file("inv-2");
	inv2.set("item", ["poção", "pergaminho"]);
	console.log("Inventário 2 (inv-2):", await inv2.toJSON());

	// --- Criar e gerenciar um Usuário ---
	console.log("\n--- Gerenciando Usuários ---");
	const user1 = UserConfigFS.file("user-123");

	user1.set("name", "Alice");
	user1.set("age", 30);
	user1.set("is_active", true);
	user1.set("inventory_ids", ["inv-1", "inv-2"]); // Atribuir inventários ao usuário

	console.log("Usuário 1 (user-123):", await user1.toJSON());

	// --- Acessando inventários relacionados usando getMany ---
	console.log("\n--- Acessando Inventários Relacionados ---");
	const user1Inventories = user1.getMany("inventory_ids");
	if (user1Inventories) {
		console.log("Inventários de Alice:");
		for (const inv of user1Inventories) {
			await inv.load(); // Carregar cada inventário relacionado
			console.log(`  - Arquivo de Inventário: ${inv.filePath}`);
			console.log(`    Itens: ${inv.get("item")}`);
			console.log(`    Localização: ${inv.get("location")}`);
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

	console.log("\nExemplo de ConfigFS concluído.");
}

runExample().catch(console.error);
