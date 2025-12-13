const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const https = require("https");
const { pipeline } = require("stream/promises");

const s3Client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = process.env.R2_PUBLIC_URL;
const VERSION = process.env.RELEASE_VERSION;
const RELEASE_TAG = process.env.RELEASE_TAG || `v${VERSION}`;
const GITHUB_REPO = process.env.GITHUB_REPOSITORY;

async function fetchExistingReleases() {
  try {
    const response = await s3Client.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: "releases.json",
      })
    );
    const body = await response.Body.transformToString();
    return JSON.parse(body);
  } catch (error) {
    if (error.name === "NoSuchKey" || error.$metadata?.httpStatusCode === 404) {
      console.log("No existing releases.json found, creating new one");
      return { latestVersion: null, releases: [] };
    }
    throw error;
  }
}

async function uploadFile(localPath, r2Key, contentType) {
  const fileBuffer = fs.readFileSync(localPath);
  const stats = fs.statSync(localPath);

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: contentType,
    })
  );

  console.log(`Uploaded: ${r2Key} (${stats.size} bytes)`);
  return stats.size;
}

function findArtifacts(dir, pattern) {
  if (!fs.existsSync(dir)) return [];
  const files = fs.readdirSync(dir);
  return files.filter((f) => pattern.test(f)).map((f) => path.join(dir, f));
}

async function checkUrlAccessible(url, maxRetries = 10, initialDelay = 1000) {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const isAccessible = await new Promise((resolve, reject) => {
        const request = https.get(url, { timeout: 10000 }, (response) => {
          // Follow redirects immediately (no retry needed for redirects)
          if (response.statusCode === 302 || response.statusCode === 301) {
            response.destroy();
            const redirectUrl = response.headers.location;
            // Recursively check the redirect URL, but only once (no retries)
            return https
              .get(redirectUrl, { timeout: 10000 }, (redirectResponse) => {
                const isGood =
                  redirectResponse.statusCode >= 200 &&
                  redirectResponse.statusCode < 300;
                redirectResponse.destroy();
                resolve(isGood);
              })
              .on("error", () => resolve(false))
              .on("timeout", function () {
                this.destroy();
                resolve(false);
              });
          }
          // Check if status is good (200-299 range)
          const isGood =
            response.statusCode >= 200 && response.statusCode < 300;
          response.destroy();
          resolve(isGood);
        });
        request.on("error", (error) => {
          resolve(false);
        });
        request.on("timeout", () => {
          request.destroy();
          resolve(false);
        });
      });

      if (isAccessible) {
        if (attempt > 0) {
          console.log(`URL ${url} is now accessible after ${attempt} retries`);
        }
        return true;
      }
    } catch (error) {
      // Continue to retry
    }

    if (attempt < maxRetries - 1) {
      const delay = initialDelay * Math.pow(2, attempt);
      console.log(
        `URL ${url} not accessible yet (attempt ${
          attempt + 1
        }/${maxRetries}), retrying in ${delay}ms...`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw new Error(`URL ${url} is not accessible after ${maxRetries} attempts`);
}

async function downloadFromGitHub(url, outputPath) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Follow redirect
          return downloadFromGitHub(response.headers.location, outputPath)
            .then(resolve)
            .catch(reject);
        }
        if (response.statusCode !== 200) {
          reject(
            new Error(
              `Failed to download ${url}: ${response.statusCode} ${response.statusMessage}`
            )
          );
          return;
        }
        const fileStream = fs.createWriteStream(outputPath);
        response.pipe(fileStream);
        fileStream.on("finish", () => {
          fileStream.close();
          resolve();
        });
        fileStream.on("error", reject);
      })
      .on("error", reject);
  });
}

async function main() {
  const artifactsDir = "artifacts";
  const tempDir = path.join(artifactsDir, "temp");

  // Create temp directory for downloaded GitHub archives
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }

  // Download source archives from GitHub
  const githubZipUrl = `https://github.com/${GITHUB_REPO}/archive/refs/tags/${RELEASE_TAG}.zip`;
  const githubTarGzUrl = `https://github.com/${GITHUB_REPO}/archive/refs/tags/${RELEASE_TAG}.tar.gz`;

  const sourceZipPath = path.join(tempDir, `automaker-${VERSION}.zip`);
  const sourceTarGzPath = path.join(tempDir, `automaker-${VERSION}.tar.gz`);

  console.log(`Waiting for source archives to be available on GitHub...`);
  console.log(`  ZIP: ${githubZipUrl}`);
  console.log(`  TAR.GZ: ${githubTarGzUrl}`);

  // Wait for archives to be accessible with exponential backoff
  await checkUrlAccessible(githubZipUrl);
  await checkUrlAccessible(githubTarGzUrl);

  console.log(`Downloading source archives from GitHub...`);
  await downloadFromGitHub(githubZipUrl, sourceZipPath);
  await downloadFromGitHub(githubTarGzUrl, sourceTarGzPath);

  console.log(`Downloaded source archives successfully`);

  // Find all artifacts
  const artifacts = {
    windows: findArtifacts(path.join(artifactsDir, "windows-builds"), /\.exe$/),
    macos: findArtifacts(path.join(artifactsDir, "macos-builds"), /-x64\.dmg$/),
    macosArm: findArtifacts(
      path.join(artifactsDir, "macos-builds"),
      /-arm64\.dmg$/
    ),
    linux: findArtifacts(
      path.join(artifactsDir, "linux-builds"),
      /\.AppImage$/
    ),
    sourceZip: [sourceZipPath],
    sourceTarGz: [sourceTarGzPath],
  };

  console.log("Found artifacts:");
  for (const [platform, files] of Object.entries(artifacts)) {
    console.log(
      `  ${platform}: ${
        files.length > 0
          ? files.map((f) => path.basename(f)).join(", ")
          : "none"
      }`
    );
  }

  // Upload each artifact to R2
  const assets = {};
  const contentTypes = {
    windows: "application/x-msdownload",
    macos: "application/x-apple-diskimage",
    macosArm: "application/x-apple-diskimage",
    linux: "application/x-executable",
    sourceZip: "application/zip",
    sourceTarGz: "application/gzip",
  };

  for (const [platform, files] of Object.entries(artifacts)) {
    if (files.length === 0) {
      console.warn(`Warning: No artifact found for ${platform}`);
      continue;
    }

    // Use the first matching file for each platform
    const localPath = files[0];
    const filename = path.basename(localPath);
    const r2Key = `releases/${VERSION}/${filename}`;
    const size = await uploadFile(localPath, r2Key, contentTypes[platform]);

    assets[platform] = {
      url: `${PUBLIC_URL}/releases/${VERSION}/${filename}`,
      filename,
      size,
      arch:
        platform === "macosArm"
          ? "arm64"
          : platform === "sourceZip" || platform === "sourceTarGz"
          ? "source"
          : "x64",
    };
  }

  // Fetch and update releases.json
  const releasesData = await fetchExistingReleases();

  const newRelease = {
    version: VERSION,
    date: new Date().toISOString(),
    assets,
    githubReleaseUrl: `https://github.com/${GITHUB_REPO}/releases/tag/${RELEASE_TAG}`,
  };

  // Remove existing entry for this version if re-running
  releasesData.releases = releasesData.releases.filter(
    (r) => r.version !== VERSION
  );

  // Prepend new release
  releasesData.releases.unshift(newRelease);
  releasesData.latestVersion = VERSION;

  // Upload updated releases.json
  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: "releases.json",
      Body: JSON.stringify(releasesData, null, 2),
      ContentType: "application/json",
      CacheControl: "public, max-age=60",
    })
  );

  console.log("Successfully updated releases.json");
  console.log(`Latest version: ${VERSION}`);
  console.log(`Total releases: ${releasesData.releases.length}`);
}

main().catch((err) => {
  console.error("Failed to upload to R2:", err);
  process.exit(1);
});
