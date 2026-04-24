class Job {
  constructor(id, time) {
    this.id = id;
    this.time = time;
    this.inDegree = 0;
    this.startTime = 0;
    this.dependents = [];
  }
}

class Schedule {
  constructor() {
    this.jobs = [];
  }

  insert(time) {
    const job = new Job(this.jobs.length, time);
    this.jobs.push(job);
    return job;
  }

  finish() {
    const queue = [];
    let processed = 0;
    let totalTime = 0;

    const indeg = this.jobs.map(j => j.inDegree);

    for (const job of this.jobs) {
      if (indeg[job.id] === 0) queue.push(job);
    }

    while (queue.length) {
      const u = queue.shift();
      processed++;

      const finishTime = u.startTime + u.time;
      totalTime = Math.max(totalTime, finishTime);

      for (const v of u.dependents) {
        v.startTime = Math.max(v.startTime, finishTime);
        indeg[v.id]--;

        if (indeg[v.id] === 0) queue.push(v);
      }
    }

    return processed === this.jobs.length ? totalTime : -1;
  }
}

module.exports = { Schedule };