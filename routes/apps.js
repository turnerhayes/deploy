"use strict";

const HTTPStatusCodes = require("http-status-codes");
const express         = require("express");
const bodyParser      = require("body-parser");
const crypto          = require("crypto");
const Deployer        = require("../deployer");
const router          = express.Router();
const DEPLOY_CONFIG   = require("../deploy.config.json");

function verifySignature(req, res, next) {
	const hmac = crypto.createHmac("sha1", process.env.GITHUB_SECRET);

	if (!req.get("X-Hub-Signature")) {
		const err = new Error("No signature included");
		err.status = HTTPStatusCodes.BAD_REQUEST;
		next(err);
		return;
	}

	if (!req.body) {
		const err = new Error("No request body");
		err.status = HTTPStatusCodes.BAD_REQUEST;
		next(err);
		return;
	}

	hmac.update(req.body);

	const hash = Buffer.from("sha1=" + hmac.digest("hex"));
	const headerBuffer = Buffer.from(req.get("X-Hub-Signature"));

	if (!crypto.timingSafeEqual(hash, headerBuffer)) {
		const err = new Error("Request signature was incorrect");
		err.status = HTTPStatusCodes.BAD_REQUEST;
		next(err);
		return;
	}

	next();
}

Object.keys(DEPLOY_CONFIG.apps).forEach(
	(appName) => {
		router.post(`/${appName}/push-deploy`, bodyParser.raw({ type: "application/json" }), verifySignature, (req, res, next) => {
			Deployer.deployApp(appName).catch(next);
			
			res.send(HTTPStatusCodes.ACCEPTED);
		});

		router.post(`/${appName}/install`, (req, res, next) => {
			Deployer.installApp(appName).then(
				() => res.status(HTTPStatusCodes.ACCEPTED).send()
			).catch(next);
		});

		router.delete(`/${appName}/temp-dirs`, (req, res, next) => {
			Deployer.cleanTempDirs(appName).then(
				() => res.send()
			).catch(next);
		});
	}
);

module.exports = router;
