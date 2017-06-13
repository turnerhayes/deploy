"use strict";

const path          = require("path");
const Promise       = require("bluebird");
const Git           = require("nodegit");
const del           = require("del");
const fs            = Promise.promisifyAll(require("fs"));
const mv            = Promise.promisify(require("mv"));
const mkdirp        = Promise.promisify(require("mkdirp"));
const { spawn }     = require("child_process");
const debug         = require("debug")("deploy:deployer");
const DEPLOY_CONFIG = require("./deploy.config.json");

const BASE_DIR = process.env.DEPLOY_TARGET_BASE || process.env.HOME;

function getLocalPath(appName) {
	let { localPath } = DEPLOY_CONFIG.apps[appName];
	return path.resolve(BASE_DIR, localPath);
}

function getTempDirName(appName) {
	const localPath = getLocalPath(appName);

	return path.join(path.dirname(localPath), `${path.basename(localPath)}_temp_`);
}

function cloneApp({ repo, localPath, branch }) {
	debug(`Cloning repo at ${repo}${branch ? ", branch " + branch : ""} to ${localPath}`);

	return Promise.resolve(
		Git.Clone(repo, localPath, {
			checkoutBranch: branch
		})
	);
}

function installNodeApp({ localPath, environment = process.env.NODE_ENV }) {
	return new Promise(
		(resolve, reject) => {
			let rejected = false;

			debug(`Running command "npm install" from directory ${localPath} with environment ${environment}`);

			const installCommand = spawn(
				"npm",
				["install"],
				{
					cwd: localPath,
					env: {
						NODE_ENV: environment
					}
				}
			);

			const stdout = [];
			const stderr = [];

			installCommand.on("close", (code) => {
				if (!rejected && code === 0) {
					resolve({ stdout: stdout.join("") });
					return;
				}

				if (!rejected) {
					// code is non-zero--reject
					reject({ code, stderr: stderr.join("") });
					rejected = true;
				}
			});

			installCommand.on("error", (error) => {
				if (!rejected) {
					reject({ error, stderr: stderr.join("") });
					rejected = true;
				}
			});

			installCommand.stdout.on("data", (data) => {
				stdout.push(data);
			});

			installCommand.stderr.on("data", (data) => {
				stderr.push(data);
			});
		}
	);
}

function installApp({ appType, localPath, environment = process.env.NODE_ENV }) {
	if (appType.toLowerCase() === "node") {
		return installNodeApp({ localPath, environment });
	}

	throw new Error(`Unrecognized app type "${appType}"; cannot install`);
}

exports = module.exports = class Deployer {
	static deployApp(appName) {
		if (!(appName in DEPLOY_CONFIG.apps)) {
			throw new Error(`No deployment configuration for app "${appName}"`);
		}

		const appConfig = DEPLOY_CONFIG.apps[appName];
		const { repo, branch, environment, appType } = appConfig;
		let { filesToKeep } = appConfig;
		const localPath = getLocalPath(appName);

		const filesToDelete = [`${localPath}/**`];


		let hasExistingDir = false;

		let tempDir;

		return fs.readdirAsync(localPath).then(
			() => hasExistingDir = true
		).catch(
			(err) => {
				if (err.code === "ENOENT") {
					hasExistingDir = false;
					return;
				}

				throw err;
			}
		).then(
			() => {
				const keepingFiles = hasExistingDir && !!filesToKeep;

				if (keepingFiles) {
					if (!Array.isArray(filesToKeep)) {
						filesToKeep = [filesToKeep];
					}

					// If we're keeping some files, keep the base directory
					filesToDelete.push(`!${localPath}`);

					filesToKeep.forEach(
						(file) => filesToDelete.push(`!${path.resolve(localPath, file)}`)
					);

					tempDir = `${getTempDirName(appName) + Date.now()}`;
				}

				let promise = Promise.resolve();

				if (hasExistingDir) {
					debug("deleting files: ", filesToDelete);

					promise = promise.then(
						del(filesToDelete, { dot: true })
					);	
				}

				if (keepingFiles) {
					promise = promise.then(
						() => {
							debug("Moving kept files to temp directory");
							return mkdirp(tempDir);
						}
					).then(
						() => mv(localPath, tempDir)
					);
				}

				promise = promise.then(
					() => cloneApp({
						repo,
						branch,
						localPath
					})
				).then(
					() => installApp({ appType, localPath, environment }).then(
						({ stdout }) => {
							debug("install output:", stdout);
						}
					).catch(
						({ stderr, error, code}) => {
							if (error) {
								debug("install error: ", error, stderr);
							}
							else {
								debug(`install error (exit code ${code}):`, stderr);
							}
						}
					)
				);

				if (keepingFiles) {
					promise = promise.then(
						() => {
							debug("Copying kept files back to local path");
							return fs.readdirAsync(
								tempDir
							).then(
								(files) => Promise.all(
									files.map(
										(file) => {
											debug(
												"Moving " + path.join(tempDir, file) +
												" to " + path.join(localPath, file)
											);

											return mv(
												path.join(tempDir, file),
												path.join(localPath, file)
											);
										}
									)
								)
							);
						}
					).then(
						() => Deployer.cleanTempDirs(appName)
					);
				}

				return promise.then();
			}
		);
	}

	static cloneApp(appName) {
		const { repo, localPath, branch } = DEPLOY_CONFIG.apps[appName];

		return cloneApp({ repo, localPath, branch });
	}

	static installApp(appName) {
		const localPath = getLocalPath(appName);

		return fs.readdirAsync(localPath).then(
			(files) => {
				if (files.length === 0) {
					throw new Error(`Local path ${localPath} is empty`);
				}
			}
		).catch(
			(err) => {
				if (err.code === "ENOENT") {
					throw new Error(`Local path ${localPath} does not exist`);
				}

				throw err;
			}
		).then(
			() => installApp({ localPath, environment: DEPLOY_CONFIG.apps[appName].environment })
		);
	}

	static cleanTempDirs(appName) {
		const tempDirName = `${getTempDirName(appName)}*`;

		debug(`Deleting temp directories matching ${tempDirName}`);
		return Promise.resolve(del([tempDirName]));
	}
};
