const snoowrap = require("snoowrap");
const process = require('process');
const neo4j = require("neo4j-driver").v1;

const driver = neo4j.driver("bolt://localhost", neo4j.auth.basic("neo4j", "1234"));
const session = driver.session();

/*
 Create a new snoowrap requester with OAuth credentials.
 For more information on getting credentials, see here: https://github.com/not-an-aardvark/reddit-oauth-helper
*/
const reddit = new snoowrap({
    userAgent: 'script:scraper:v0.0.1',
    clientId: process.env["clientId"],
    clientSecret: process.env["clientSecret"],
    username: process.env["username"],
    password: process.env["password"],
});

let doPerModerator = (moderator, subreddit) => {
    let modName = moderator['name'];

    // language=Cypher
    const makeUser = `
      CREATE (a:User {name: {name}})
    `;

    // language=Cypher
    const cypherQuery = `
      MATCH (a:User), (b:Subreddit)
        WHERE a.name = {name} AND b.name = {subreddit}
      CREATE (a)-[r:MODERATES]->(b)
      RETURN type(r)`;

    session
        .run(makeUser,
            {
                name: modName
            }
        )
        .then(console.log)
        .catch(reason => {
            console.log(reason)
        });

    session
        .run(cypherQuery,
            {
                name: modName,
                subreddit: subreddit,
            }
        )
        .then(console.log)
        .catch(reason => {
            console.log(reason)
        });

};

let doPerSubreddit = subreddit => {
    let name = subreddit['display_name'];

    reddit.getSubreddit(name).getModerators().then(value => {
        //console.log("---r/" + name + " Mods---");
        for (let i = 0; i < value.length; i++) {
            let moderator = value[i];
            doPerModerator(moderator, name);
        }


    });


};

let limitPerRequest = 60;
reddit
    .getPopularSubreddits({
        limit: limitPerRequest,
        show: "all"
    })
    .then(value => {
        for (let i = 0; i < limitPerRequest; i++) {
            let subreddit = value[i];
            doPerSubreddit(subreddit);
        }
    })
    .catch(console.log);