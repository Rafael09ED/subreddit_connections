'use strict';
// Forked from https://github.com/sindresorhus/p-queue/blob/805339d42f15c7ea13a7288747f61db79d4d43fa/index.js

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

class ThrottledPQueue {
    constructor(opts) {
        opts = Object.assign({
            runningConcurrency: false,       // max is for concurrent running vs concurrent started in interval
            concurrentMax: Infinity,
            intervalTime: 0,         // the interval time is ms
            autoStart: true,
            queueClass: PriorityQueue
        }, opts);

        if (!(typeof opts.concurrentMax === 'number' && opts.concurrentMax >= 1)) {
            throw new TypeError(`Expected \`concurrentMax\` to be a number from 1 and up, got \`${opts.concurrentMax}\` (${typeof opts.concurrentMax})`);
        }
        if (!(typeof opts.intervalTime === 'number' && Number.isFinite(opts.intervalTime) && opts.intervalTime >= 0)) {
            throw new TypeError(`Expected \`intervalTime\` to be a finite number >= 0, got \`${opts.intervalTime}\` (${typeof opts.intervalTime})`);
        }

        this._concurrentCountIsNewIntervalCount = opts.runningConcurrency;
        this._isPaused = opts.autoStart === false;

        this.queue = new opts.queueClass();
        this._queueClass = opts.queueClass;

        this._concurrentCount = 0;
        this._concurrentMax = opts.concurrentMax;

        this._isIntervalIgnored = this._concurrentMax === Infinity || this._intervalTime === 0;
        this._intervalCount = 0;
        this._intervalTime = opts.intervalTime;
        this._intervalId = null;

        this._resolveEmpty = () => {};
        this._resolveIdle = () => {};
    }

    get _doesIntervalAllowAnother() {
        return this._isIntervalIgnored || this._intervalCount < this._concurrentMax;
    }

    get _areAnyQueued() {
        return this.queue.size > 0;
    }

    get _doesConcurrentAllowAnother() {
        return this._concurrentCount < this._concurrentMax;
    }

    _onIndividualCompletion() {
        this._concurrentCount--;
        this._tryToStartAnother();
    }

    _tryToStartAnother() {
        if (!this._areAnyQueued) {
            this._resolvePromises();
            return false;
        }
        if (!this._isPaused && this._doesIntervalAllowAnother && this._doesConcurrentAllowAnother) {
            this.queue.dequeue()();
            this._initializeIntervalIfNeeded();
            return true;
        }
        return false;
    }

    _initializeIntervalIfNeeded() {
        if (this._isIntervalIgnored || this._intervalId !== null)
            return;
        this._intervalId = setInterval(() => this._onInterval(), this._intervalTime)
    }

    _resolvePromises() {
        this._resolveEmpty();
        this._resolveEmpty = () => {};

        if (this._concurrentCount === 0) {
            this._resolveIdle();
            this._resolveIdle = () => {};
        }
    }

    _onInterval() {
        if (0 === this._intervalCount && 0 === this._concurrentCount) {
            clearInterval(this._intervalId);
            this._intervalId = null;
        }
        this._intervalCount = (this._concurrentCountIsNewIntervalCount) ? this._concurrentCount : 0;
        while (this._tryToStartAnother()) {}
    }

    add(fn, opts) {
        return new Promise((resolve, reject) => {
            const run = () => {
                this._concurrentCount++;
                this._intervalCount++;
                if (this._intervalId === null)
                    this._intervalId = setInterval(() => this._onInterval(), this._intervalTime);

                try {
                    Promise.resolve(fn()).then(
                        val => {
                            resolve(val);
                            this._onIndividualCompletion();
                        },
                        err => {
                            reject(err);
                            this._onIndividualCompletion();
                        }
                    );
                } catch (err) {
                    reject(err);
                    this._onIndividualCompletion();
                }
            };
            this.queue.enqueue(run, opts);
            this._tryToStartAnother();

        });
    }

    addAll(fns, opts) {
        return Promise.all(fns.map(fn => this.add(fn, opts)));
    }

    start() {
        if (!this._isPaused) return;
        this._isPaused = false;
        while (this._tryToStartAnother()) {}
    }

    pause() {
        this._isPaused = true;
    }

    clear() {
        this.queue = new this._queueClass();
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
        if (this._concurrentCount === 0 && this.queue.size === 0) {
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
        return this._concurrentCount;
    }

    get isPaused() {
        return this._isPaused;
    }

    close() {
        clearInterval(this._intervalId);
        this._intervalId = null;
    }
}

module.exports = ThrottledPQueue;