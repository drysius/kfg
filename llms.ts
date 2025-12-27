import { readdir, stat, readFile, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";

const SRC_DIR = "src";
const OUTPUT_FILE = "llms.txt";

async function getFiles(dir: string): Promise<string[]> {
  const dirents = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    dirents.map((dirent) => {
      const res = join(dir, dirent.name);
      return dirent.isDirectory() ? getFiles(res) : res;
    })
  );
  return Array.prototype.concat(...files);
}

async function generateLlmsFile() {
  try {
    const files = await getFiles(SRC_DIR);
    let outputContent = "";

    console.log(`Found ${files.length} files in ${SRC_DIR}. Processing...`);

    for (const file of files) {
        // Skip non-text files if necessary, but "read entire folder" usually implies code.
        // We'll assume they are text based on the project structure (ts files).
        const content = await readFile(file, "utf-8");
        const relativePath = relative(process.cwd(), file);
        
        outputContent += `\n--- START OF FILE: ${relativePath} ---\n`;
        outputContent += content;
        outputContent += `\n--- END OF FILE: ${relativePath} ---\n`;
    }

    await writeFile(OUTPUT_FILE, outputContent, "utf-8");
    console.log(`Successfully created ${OUTPUT_FILE}`);

  } catch (error) {
    console.error("Error generating llms.txt:", error);
    process.exit(1);
  }
}

generateLlmsFile();
