export class RWLock {
  constructor() {
    this._readers = 0
    this._writer = false
    this._queue = []
  }

  acquireRead() {
    return new Promise(resolve => {
      if (!this._writer && this._queue.length === 0) {
        this._readers++
        resolve()
        return
      }
      this._queue.push({ type: "read", resolve })
    })
  }

  acquireWrite() {
    return new Promise(resolve => {
      if (this._readers === 0 && !this._writer) {
        this._writer = true
        resolve()
        return
      }
      this._queue.push({ type: "write", resolve })
    })
  }

  releaseRead() {
    this._readers--
    this._dequeue()
  }

  releaseWrite() {
    this._writer = false
    this._dequeue()
  }

  _dequeue() {
    if (this._queue.length === 0) return

    if (this._writer) return

    const next = this._queue[0]

    if (next.type === "write") {
      if (this._readers > 0) return
      this._queue.shift()
      this._writer = true
      next.resolve()
      return
    }

    while (this._queue.length > 0 && this._queue[0].type === "read") {
      const item = this._queue.shift()
      this._readers++
      item.resolve()
    }
  }
}

export default RWLock
