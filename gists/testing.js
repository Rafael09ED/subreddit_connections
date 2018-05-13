const PQueue = require("../throttledPQueue");

const tpq = new PQueue({
    autoStart: false,
    concurrency: Infinity,
    maxInInterval: 10,
    interval: 2000,
});

for (let i = 0; i < 100; i++) {
    console.log("added " + i + " func");
    tpq.add(() => {
        let j = i;
        console.log(j);
    })
}
tpq.start();
tpq.onIdle().then(() => {
    console.log("on idle")
});
tpq.onEmpty().then(() => {
    console.log("on empty")
});
console.log("added all funcs");