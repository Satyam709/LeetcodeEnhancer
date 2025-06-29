const fs = require("fs");
const path = require("path");
const archiver = require("archiver");

// Get version from package.json
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const version = packageJson.version;

// Create releases directory if it doesn't exist
const releasesDir = "releases";
if (!fs.existsSync(releasesDir)) {
  fs.mkdirSync(releasesDir);
}

// Function to create zip file
function createZip(outputName, files) {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(path.join(releasesDir, outputName));
    const archive = archiver("zip", { zlib: { level: 9 } });

    output.on("close", () => {
      console.log(`✅ ${outputName} created (${archive.pointer()} bytes)`);
      resolve();
    });

    archive.on("error", (err) => {
      reject(err);
    });

    archive.pipe(output);

    // Add files to archive
    files.forEach((file) => {
      if (fs.existsSync(file.src)) {
        if (fs.statSync(file.src).isDirectory()) {
          archive.directory(file.src, file.dest);
        } else {
          archive.file(file.src, { name: file.dest });
        }
      } else {
        console.warn(`⚠️  Warning: ${file.src} not found`);
      }
    });

    archive.finalize();
  });
}

async function main() {
  try {
    console.log("🚀 Building extension...");

    // Build the project first
    const { execSync } = require("child_process");
    execSync("pnpm run build", { stdio: "inherit" });

    console.log("📦 Creating release packages...");

    // Files to include in both versions
    const commonFiles = [
      { src: "dist", dest: "dist" },
      { src: "assets", dest: "assets" },
    ];

    // Create Chrome version
    const chromeFiles = [
      ...commonFiles,
      { src: "manifest.json", dest: "manifest.json" },
    ];

    await createZip(
      `leetcode-enhancer-chrome-v${version}.zip`,
      chromeFiles
    );

    // Create Firefox version
    const firefoxFiles = [
      ...commonFiles,
      { src: "firefox-manifest.json", dest: "manifest.json" },
    ];

    await createZip(
      `leetcode-enhancer-firefox-v${version}.zip`,
      firefoxFiles
    );

    console.log("🎉 Release packages created successfully!");
    console.log(`📁 Check the '${releasesDir}' directory for your zip files.`);
  } catch (error) {
    console.error("❌ Error creating release:", error);
    process.exit(1);
  }
}

main();
