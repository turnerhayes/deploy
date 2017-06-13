"use strict";

const express         = require("express");
const logger          = require("morgan");
// const bodyParser      = require("body-parser");
const HTTPStatusCodes = require("http-status-codes");
const appRoutes       = require("./routes/apps");

if (!process.env.GITHUB_SECRET) {
	throw new Error("GITHUB_SECRET environment variable must be provided");
}

const app = express();

app.use(logger("dev"));
// app.use(bodyParser.json());
// app.use(bodyParser.urlencoded({ extended: true }));

app.use("/apps", appRoutes);

const IS_DEVELOPMENT = app.get("env") === "development";

/// catch 404 and forwarding to error handler
app.use(function(req, res, next) {
	const err = new Error("Not Found");
	err.status = HTTPStatusCodes.NOT_FOUND;
	next(err);
});

/// error handlers

// eslint-disable-next-line no-unused-vars
app.use(function(err, req, res, next) {
	res.status(err.status || HTTPStatusCodes.INTERNAL_SERVER_ERROR);
	console.error(err);
	
	res.json(
		IS_DEVELOPMENT ?
			{
				message: err.message,
				stack: err.stack
			} :
			{
				error: {
					message: err.message
				}
			}
	);
});


module.exports = app;
