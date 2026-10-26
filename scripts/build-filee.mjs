// Builds Filee (vendor/filee, a git submodule) into src-tauri/resources/filee, which the Tauri bundle ships as the
// "filee" resource folder: Filee.exe (the app with the radial menu), filee-cli.exe (conversions for the shelf and the
// launcher), the .NET runtime they share, and the small rhwp and 7-Zip engines. Filee downloads its large engines
// itself when they are first needed.
//
// Same publish as Filee's own build/build-installer.ps1, except:
//   - no -p:FileeRelease=true: that makes Filee register its own startup entry and Explorer menu; Bloom starts it
//     (bloom-filee-radial) and the Explorer menu extension isn't built here;
//   - no Setup or zip around it.
//
// Usage: bun scripts/build-filee.mjs [--force]
// Needs the .NET SDK version in vendor/filee/global.json (10.0.100 or later). Skips the build when the output was
// made from the same submodule commit, unless --force.

import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const filee = join(root, "vendor", "filee");
const out = join(root, "src-tauri", "resources", "filee");
const stampFile = join(out, ".bloom-build.json");
// Committed so the resource path exists in builds without Filee (tauri-build needs it).
const PLACEHOLDER = ".placeholder";
const force = process.argv.includes("--force");

function fail(message) {
	console.error(`build-filee: ${message}`);
	process.exit(1);
}

function run(command, args, options = {}) {
	console.log(`> ${command} ${args.join(" ")}`);
	const result = spawnSync(command, args, { stdio: "inherit", cwd: root, ...options });
	if (result.error) fail(`${command}: ${result.error.message}`);
	if (result.status !== 0) fail(`${command} exited with ${result.status}`);
}

if (!existsSync(join(filee, "src", "Filee.App", "Filee.App.csproj")))
	fail("vendor/filee is missing. Run: git submodule update --init vendor/filee");

const commit = execFileSync("git", ["-C", filee, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
if (!force && existsSync(stampFile)) {
	try {
		if (JSON.parse(readFileSync(stampFile, "utf8")).commit === commit) {
			console.log(`build-filee: up to date (${commit.slice(0, 8)})`);
			process.exit(0);
		}
	} catch {
		// An unreadable stamp rebuilds.
	}
}

const wanted = JSON.parse(readFileSync(join(filee, "global.json"), "utf8")).sdk.version;
const sdks = spawnSync("dotnet", ["--list-sdks"], { encoding: "utf8" });
if (sdks.error) fail(`the .NET SDK ${wanted} or later is needed (dotnet not found)`);
const major = Number(wanted.split(".")[0]);
if (!sdks.stdout.split("\n").some((line) => Number(line.split(".")[0]) >= major))
	fail(`the .NET SDK ${wanted} or later is needed; installed:\n${sdks.stdout}`);

const props = readFileSync(join(filee, "Directory.Build.props"), "utf8");
const version = props.match(/<Version>([^<]+)<\/Version>/)?.[1] ?? "0.0.0";
console.log(`build-filee: Filee ${version} (${commit.slice(0, 8)}) -> ${out}`);

// Clear the previous build, keeping the committed placeholder.
mkdirSync(out, { recursive: true });
for (const entry of readdirSync(out)) {
	if (entry !== PLACEHOLDER) rmSync(join(out, entry), { recursive: true, force: true });
}

for (const project of ["Filee.App", "Filee.Cli"]) {
	run("dotnet", [
		"publish",
		join(filee, "src", project, `${project}.csproj`),
		"-c",
		"Release",
		"-r",
		"win-x64",
		"--self-contained",
		`-p:Version=${version}`,
		"-p:PublishReadyToRun=true",
		"-o",
		out
	]);
}

// Native debug symbols from NuGet packages (~105 MB) come back when the CLI publishes into the same folder.
for (const entry of readdirSync(out)) {
	if (/^lib.*\.pdb$/i.test(entry)) rmSync(join(out, entry));
}

// rhwp and 7-Zip, plus the Microsoft C++ runtime next to rhwp.exe and Filee.exe, so neither needs the Visual C++
// Redistributable. Pinned and SHA-256-checked by Filee's engines.json. Windows PowerShell 5.1 runs it as well as pwsh.
const powershell = spawnSync("pwsh", ["-v"]).error ? "powershell" : "pwsh";
run(powershell, [
	"-NoProfile",
	"-ExecutionPolicy",
	"Bypass",
	"-File",
	join(filee, "build", "fetch-engines.ps1"),
	"-Only",
	"rhwp,7zip",
	"-Destination",
	join(out, "engines"),
	"-RuntimeTo",
	out
]);

for (const required of [
	"Filee.exe",
	"filee-cli.exe",
	"vcruntime140.dll",
	join("engines", "rhwp", "vcruntime140.dll")
]) {
	if (!existsSync(join(out, required))) fail(`${required} is missing in ${out}`);
}
// A leftover uninstall.exe would make Filee treat this copy as installed and try to update it in place.
for (const forbidden of ["uninstall.exe", "unins000.exe"]) {
	if (existsSync(join(out, forbidden))) fail(`${forbidden} must not be in ${out}`);
}

for (const notice of ["LICENSE", "THIRD-PARTY-NOTICES.md"]) {
	cpSync(join(filee, notice), join(out, notice));
}
writeFileSync(stampFile, JSON.stringify({ commit, version }, null, "\t") + "\n");
console.log(`build-filee: done (Filee ${version})`);
