/*
    Subreddit and Subreddit Moderator relation importer for Neo4j
    By Rafael Dejesus
    5/12/2018 v0.0.1
 */


// -- Imports --
const snoowrap = require("snoowrap");
const process = require('process');
const neo4j = require("neo4j-driver").v1;
const PQueue = require("p-queue");
//const PThrottleQueue = require('./throttledPQueue');
const cc = require("./ConsoleColors");

// -- Constants --
const redditAPILimitPerRequest = 100;
const redditAPIRequestPerInterval = 60;
const redditAPIRequestIntervalTime_ms = 120 * 1000 + 1;

// -- Setup --
const neo4jDriver = neo4j.driver("bolt://localhost", neo4j.auth.basic("neo4j", "1234"));
const neo4jSession = neo4jDriver.session();
const redditQueue = new PQueue({autoStart: false});
// const redditQueue = new PThrottleQueue({
//     autoStart: false,
//     concurrency: Infinity,
//     maxInInterval: redditAPIRequestPerInterval,
//     interval: redditAPIRequestIntervalTime_ms,
//});
const neo4jQueue = new PQueue({autoStart: false, concurrency: 1});
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
reddit.config({continueAfterRatelimitError: true});


// -- Functions --

const catch_Neo4jError = (reason, name, cypher, params) => {
    if (reason.code === "Neo.ClientError.Schema.ConstraintValidationFailed")
        console.log(cc.FgYellow + name + " already added" + cc.Reset);
    else {
        console.log(cc.FgRed + reason.code + cc.Reset);
        if (cypher && params) {
            console.log(cypher);
            console.log(params);
        }
    }
};

const logReturned = (valueReturned, printValue) => {
    if (valueReturned === undefined && printValue === undefined) return;
    console.log((printValue) ? cc.FgGreen + printValue + cc.Reset : valueReturned);
};

const addSubredditToNeo4j = (subredditName, subredditIsNSFW, subredditSubscriberCount) => {
    // language=Cypher
    const addSubreddit_cypher = `
      CREATE (n:Subreddit {name: {name}, nsfw: {nsfw}, subscribers: {subscribers}})
      RETURN n.name`;

    const addSubreddit_params = {
        name: subredditName,
        nsfw: subredditIsNSFW,
        subscribers: subredditSubscriberCount
    };
    return neo4jSession
        .run(addSubreddit_cypher, addSubreddit_params)
        .then(console.log)
        .catch(reason =>
            catch_Neo4jError(reason, "Subreddit: " + subredditName, addSubreddit_cypher, addSubreddit_params));
};

const addRedditUserToNeo4j = (modName) => {
    // language=Cypher
    const makeUser_cypher = `
      CREATE (a:User {name: {name}})
    `;
    const makeUser_params = {
        name: modName
    };

    return neo4jSession
        .run(makeUser_cypher, makeUser_params)
        .then(value => logReturned(value, "User added: " + modName))
        .catch(reason => catch_Neo4jError(reason, "User: " + modName, makeUser_cypher, makeUser_params));
};

const linkModToSubredditInNeo4j = (modName, subredditName) => {
    // language=Cypher
    const linkModToSub_cypher = `
      MATCH (a:User), (b:Subreddit)
        WHERE a.name = {name} AND b.name = {subreddit}
      CREATE (a)-[r:MODERATES]->(b)
      RETURN type(r)`;

    const linkModToSub_params = {
        name: modName,
        subreddit: subredditName
    };

    return neo4jSession
        .run(linkModToSub_cypher, linkModToSub_params)
        .then(() => console.log("Added Link (User:" + modName + ")-[MODERATES]->(Subreddit:" + subredditName + ")"))
        .catch(reason => catch_Neo4jError(reason, "", linkModToSub_cypher, linkModToSub_params));

};

const processModeratorsFromSubreddit = (subredditName) => {
    return reddit.getSubreddit(subredditName).getModerators()
        .then(value => {
            for (let i = 0; i < value.length; i++) {
                let modName = value[i]['name'];
                console.log(modName);
                neo4jQueue.add(() => addRedditUserToNeo4j(modName));
                neo4jQueue.add(() => linkModToSubredditInNeo4j(modName, subredditName));
            }
        }).catch(console.log);
};

const processMostPopularSubreddits = (subredditsToGet, lastSubredditIdName, count = 0) => {
    const subredditQuery_params = {
        limit: Math.min(redditAPILimitPerRequest, subredditsToGet),
        show: "all"
    };
    if (lastSubredditIdName) {
        subredditQuery_params.after = lastSubredditIdName;
        subredditQuery_params.count = count;
    }
    return reddit
        .getPopularSubreddits(subredditQuery_params)
        .then(value => {

            console.log("reading subreddits #" + count + " - " + (count + subredditQuery_params.limit));
            for (let i = 0; i < value.length; i++) {
                const subredditQuery = value[i];
                let subredditName = subredditQuery['display_name'];
                console.log(subredditName);
                let subredditIsNSFW = subredditQuery['over18'] === true;
                let subredditSubscriberCount = parseInt(subredditQuery['subscribers']);
                neo4jQueue.add(() => addSubredditToNeo4j(subredditName, subredditIsNSFW, subredditSubscriberCount));
                redditQueue.add(() => processModeratorsFromSubreddit(subredditName));
            }

            // process remaining subreddits
            if (subredditsToGet > redditAPILimitPerRequest) {
                let nextLastSubreddit = value[redditAPILimitPerRequest - 1];
                let nextLastSubredditIdName = nextLastSubreddit["name"];
                let nextCount = count + value.length;
                let remainingSubredditsToGet = subredditsToGet - value.length;
                redditQueue.add(
                    () => processMostPopularSubreddits(remainingSubredditsToGet, nextLastSubredditIdName, nextCount)
                );
            }
        })
        .catch(console.log);

};

// -- Parameters --
const numberOfSubredditsToAdd = 2000;

// -- Code Start --

redditQueue.add(() => processMostPopularSubreddits(numberOfSubredditsToAdd));
redditQueue.start();
redditQueue.onIdle().then(() => {
    console.log("All Reddit queries done");
    console.log(neo4jQueue.size + " neo4j queries to do");
    neo4jQueue.start();
    neo4jQueue.onIdle().then(() => {
        console.log("all done");
        neo4jSession.close(() => {
            neo4jDriver.close();
        })
    });
});