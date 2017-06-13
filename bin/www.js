#!/usr/bin/nodejs
"use strict";

const path = require("path");
require("dotenv").config({ path: path.resolve("..", ".env") });
const debug = require("debug")("deploy:server");
const app   = require("../app");

app.set("port", process.env.PORT || 3000);

const server = app.listen(app.get("port"), function() {
	debug("Express server listening on port " + server.address().port);
});
