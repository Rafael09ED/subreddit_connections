const snoowrap = require("snoowrap");
const process = require('process');
const neo4j = require("neo4j-driver").v1;

const driver = neo4j.driver("bolt://localhost", neo4j.auth.basic("neo4j", "1234"));
const session = driver.session();

// Create a new snoowrap requester with OAuth credentials.
// For more information on getting credentials, see here: https://github.com/not-an-aardvark/reddit-oauth-helper
const reddit = new snoowrap({
    userAgent: 'script:scraper:v0.0.1',
    clientId: process.env["clientId"],
    clientSecret: process.env["clientSecret"],
    username: process.env["username"],
    password: process.env["password"],
});

let limitPerRequest = 2;
reddit
    .getPopularSubreddits({
        limit: limitPerRequest,
        show: "all"
    })
    .then(console.log)
    .catch(console.log);