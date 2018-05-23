const ThrottledPQueue = require("../throttledPQueue");

const tpq = new ThrottledPQueue({
    mustFinishDuringInterval: true,       // max is for concurrent running vs concurrent started in interval
    concurrentMax: 10,
    intervalTime: 2000,         // the interval time is ms
    autoStart: true
});

const wait = time => new Promise((resolve) => setTimeout(resolve, time));
const log = (val) => {
    console.log(val);
    return wait(3000).then(() => console.log('b'))
};

for (let i = 0; i < 30; i++) {
    console.log("added " + i + " func");
    tpq.add(() => {
        let j = i;
        if (10 === j)
            tpq.add(() => {
                return log('a');
            }, {priority: 1});
        return log(j);
    })
}

tpq.start();
tpq.onIdle().then(() => {
    console.log("on idle")
});
tpq.onEmpty().then(() => {
    console.log("on empty");
    tpq.close();
});
console.log("added all funcs");