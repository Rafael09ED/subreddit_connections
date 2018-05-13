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

let doPerSubreddit = subreddit => {
    let name = subreddit['display_name'];
    let nsfw = subreddit['over18'] === true;
    let subscribers = parseInt(subreddit['subscribers']);

    // language=Cypher
    const cypherQuery = `
      CREATE (n:Subreddit {name: {name}, nsfw: {nsfw}, subscribers: {subscribers}})
      RETURN n.name`;

    session
        .run(cypherQuery,
            {
                name: name,
                nsfw: nsfw,
                subscribers: subscribers
            }
        )
        .then(console.log)
        .catch(reason => {
            console.log(reason)
        });
};

let subs = [];
let limitPerRequest = 100;
reddit
    .getPopularSubreddits({
        limit: limitPerRequest,
        show: "all"
    })
    .then(value => {
        for (let i = 0; i < limitPerRequest; i++) {
            let subreddit = value[i];
            subs.push(subreddit['display_name']);
            doPerSubreddit(subreddit);
        }
    })
    .then(() => {
        console.log(subs);
    })
    .catch(console.log);