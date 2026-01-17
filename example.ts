import { Kfg, c, JsonDriver, KfgDriver } from "./src";

// Mock bcrypt for example
const bcrypt = (pass: string) => `hashed_${pass}`;

const User = new Kfg(new KfgDriver(JsonDriver.definition), {
    id: c.number({ default: 0 }),
    username: c.string(),
    password: c.string()
}, true) // Enable multimode
.on('create', (data) => {
    // data is inferred as { id: number, username: string, password: string }
    if (!data.id) data.id = User.size() + 1;
    data.password = bcrypt(data.password);
    console.log("[Hook:create] Preparing user:", data.username);
    return data;
})
.on('update', (newdata, olddata) => {
    // newdata and olddata are inferred correctly
    if (newdata.password !== olddata.password) {
         newdata.password = bcrypt(newdata.password);
    }
    console.log(`[Hook:update] User ${olddata.username} updated.`);
    return newdata;
})
.on('ready', () => {
    console.log("[Hook:ready] Kfg is loaded and ready!");
});

// Load configuration with pattern
User.load({
    path: "./data/users/{id}.json"
});

console.log("Initial users:", User.size());

// Create a new user
const newUser = User.create({
    username: "drylian",
    password: "secure_password"
});

console.log("Created User:", newUser);
console.log("Total users:", User.size());

// Scope to specific user
const user1 = User.where(String(newUser.id));

// Update username (Triggering update hook if replacing item)
// Note: hook only runs if we replace the whole item currently in kfg.ts
User.set(String(newUser.id), { ...newUser, username: "drylian_updated" });

console.log("Updated username:", User.get(`${newUser.id}.username`));