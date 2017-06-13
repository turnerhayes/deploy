#!/usr/bin/env node

"use strict";

require("dotenv").config();

const Deployer = require("./deployer");

Deployer.deployApp("quintro_dev").then(
	() => console.log("Deployed app")
).catch(
	(err) => console.error(err)
);
