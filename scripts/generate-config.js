import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read current version from version.json
const versionPath = join(__dirname, '../version.json');
const versionData = JSON.parse(readFileSync(versionPath, 'utf8'));
const currentVersion = versionData.version;

console.log(`Generating config files with version ${currentVersion}...`);

// Generate actual files from templates
const templateDir = join(__dirname, '../src-tauri');

// Generate tauri.conf.json from template
const tauriTemplate = readFileSync(join(templateDir, 'tauri.conf.template.json'), 'utf8');
const tauriConf = tauriTemplate.replace(/\{\{VERSION\}\}/g, currentVersion);
writeFileSync(join(templateDir, 'tauri.conf.json'), tauriConf);
console.log('✓ Generated tauri.conf.json from template');

// Generate Cargo.toml from template
const cargoTemplate = readFileSync(join(templateDir, 'Cargo.template.toml'), 'utf8');
const cargoToml = cargoTemplate.replace(/\{\{VERSION\}\}/g, currentVersion);
writeFileSync(join(templateDir, 'Cargo.toml'), cargoToml);
console.log('✓ Generated Cargo.toml from template');

console.log('\nConfig files generated successfully!');
