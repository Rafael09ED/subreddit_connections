'use strict';
// Copied from https://github.com/sindresorhus/p-queue/blob/805339d42f15c7ea13a7288747f61db79d4d43fa/index.js
// And https://github.com/sindresorhus/p-throttle/blob/5c1897b039a2334b635bb6d3f18758e4fcc660c5/index.js

// Port of lower_bound from http://en.cppreference.com/w/cpp/algorithm/lower_bound
// Used to compute insertion index to keep queue sorted after insertion
function lowerBound(array, value, comp) {
    let first = 0;
    let count = array.length;

    while (count > 0) {
        const step = (count / 2) | 0;
        let it = first + step;

        if (comp(array[it], value) <= 0) {
            first = ++it;
            count -= step + 1;
        } else {
            count = step;
        }
    }

    return first;
}

class PriorityQueue {
    constructor() {
        this._queue = [];
    }

    enqueue(run, opts) {
        opts = Object.assign({
            priority: 0
        }, opts);

        const element = {priority: opts.priority, run};

        if (this.size && this._queue[this.size - 1].priority >= opts.priority) {
            this._queue.push(element);
            return;
        }

        const index = lowerBound(this._queue, element, (a, b) => b.priority - a.priority);
        this._queue.splice(index, 0, element);
    }

    dequeue() {
        return this._queue.shift().run;
    }

    get size() {
        return this._queue.length;
    }
}

class PQueue {
    constructor(opts) {
        opts = Object.assign({
            concurrency: Infinity,
            maxInInterval: Infinity,
            interval: Infinity,
            autoStart: true,
            queueClass: PriorityQueue
        }, opts);

        if (!(typeof opts.concurrency === 'number' && opts.concurrency >= 1)) {
            throw new TypeError(`Expected \`concurrency\` to be a number from 1 and up, got \`${opts.concurrency}\` (${typeof opts.concurrency})`);
        }
        if (!Number.isFinite(opts.maxInInterval)) {
            throw new TypeError('Expected `maxInInterval` to be a finite number');
        }
        if (!Number.isFinite(opts.interval)) {
            throw new TypeError('Expected `interval` to be a finite number');
        }

        this.queue = new opts.queueClass(); // eslint-disable-line new-cap
        this._queueClass = opts.queueClass;
        this._pendingCount = 0; // number actively being ran
        this._concurrency = opts.concurrency;

        this._isPaused = opts.autoStart === false;
        this._resolveEmpty = () => {
        };
        this._resolveIdle = () => {
        };

        //throttle section:
        this._doneInInterval = 0;
        this._intervalTime = opts.interval;
        this._maxInInterval = opts.maxInInterval;
        this._intervalId = false;
    }

    _next() {
        this._pendingCount--;
        if (!this.canStartAnother()) return;
        this._startAnother();
    }

    _startAnother() {
        if (this.queue.size > 0) {
            if (!this._isPaused) {
                this.queue.dequeue()();
            }
        } else {
            this._resolveEmpty();
            this._resolveEmpty = () => {
            };

            if (this._pendingCount === 0) {
                this._resolveIdle();
                this._resolveIdle = () => {
                };
            }
        }
    }

    _onInterval() {
        if (0 === this._doneInInterval && 0 === this._pendingCount) {
            clearInterval(this._intervalId);
            this._intervalId = false;
        }
        this._doneInInterval = 0;
        while (this.canStartAnother())
            this._startAnother();
    }


    add(fn, opts) {
        return new Promise((resolve, reject) => {
            const run = () => {
                this._pendingCount++;
                this._doneInInterval++;
                if (!this._intervalId) {
                    this._intervalId = setInterval(this._onInterval(), this._intervalTime)
                }


                try {
                    Promise.resolve(fn()).then(
                        val => {
                            resolve(val);
                            this._next();
                        },
                        err => {
                            reject(err);
                            this._next();
                        }
                    );
                } catch (err) {
                    reject(err);
                    this._next();
                }
            };

            if (this.canStartAnother()) {
                run();
            } else {
                this.queue.enqueue(run, opts);
            }
        });
    }

    canStartAnother() {
        return !this._isPaused && this._pendingCount < this._concurrency && this._doneInInterval < this._maxInInterval;
    }

    addAll(fns, opts) {
        return Promise.all(fns.map(fn => this.add(fn, opts)));
    }

    start() {
        if (!this._isPaused) {
            return;
        }

        this._isPaused = false;
        while (this.canStartAnother()) {
            this.queue.dequeue()();
        }
    }

    pause() {
        this._isPaused = true;
    }

    clear() {
        this.queue = new this._queueClass(); // eslint-disable-line new-cap
    }

    onEmpty() {
        // Instantly resolve if the queue is empty
        if (this.queue.size === 0) {
            return Promise.resolve();
        }

        return new Promise(resolve => {
            const existingResolve = this._resolveEmpty;
            this._resolveEmpty = () => {
                existingResolve();
                resolve();
            };
        });
    }

    onIdle() {
        // Instantly resolve if none pending & if nothing else is queued
        if (this._pendingCount === 0 && this.queue.size === 0) {
            return Promise.resolve();
        }

        return new Promise(resolve => { // linked list of resolves
            const existingResolve = this._resolveIdle;
            this._resolveIdle = () => {
                existingResolve();
                resolve();
            };
        });
    }

    get size() {
        return this.queue.size;
    }

    get pending() {
        return this._pendingCount;
    }

    get isPaused() {
        return this._isPaused;
    }
}

module.exports = PQueue;