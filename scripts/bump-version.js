import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version.json
const versionPath = join(__dirname, '../version.json');
const versionData = JSON.parse(readFileSync(versionPath, 'utf8'));

// Increment version
const version = versionData.version.split('.');
version[2] = parseInt(version[2]) + 1;
const newVersion = version.join('.');

// Update version.json
versionData.version = newVersion;
writeFileSync(versionPath, JSON.stringify(versionData, null, 2) + '\n');

// Update tauri.conf.json
const tauriConfPath = join(__dirname, '../src-tauri/tauri.conf.json');
const tauriConf = JSON.parse(readFileSync(tauriConfPath, 'utf8'));
tauriConf.version = newVersion;
writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n');

// Update Cargo.toml
const cargoTomlPath = join(__dirname, '../src-tauri/Cargo.toml');
const cargoToml = readFileSync(cargoTomlPath, 'utf8');
const updatedCargoToml = cargoToml.replace(
  /^version = ".*"$/m,
  `version = "${newVersion}"`
);
writeFileSync(cargoTomlPath, updatedCargoToml);

console.log(`Version bumped to ${newVersion}`);
