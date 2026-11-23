/**
 * test/helpers/fake-canvas-context.mjs
 *
 * Deterministic mock HTMLCanvasElement & CanvasRenderingContext2D for Node.js tests.
 */

export class FakeCanvasContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.filter = "none";
    this.globalCompositeOperation = "source-over";
    this.globalAlpha = 1;
    this.strokeStyle = "#000000";
    this.fillStyle = "#000000";
    this.lineWidth = 1;
    this.calls = [];
    this._stack = [];
    this._lineDash = [];
    this._buffer = new Uint8ClampedArray(
      (canvas.width || 1) * (canvas.height || 1) * 4,
    );
  }

  save() {
    this._stack.push({
      filter: this.filter,
      globalCompositeOperation: this.globalCompositeOperation,
      globalAlpha: this.globalAlpha,
      strokeStyle: this.strokeStyle,
      fillStyle: this.fillStyle,
      lineWidth: this.lineWidth,
      lineDash: [...this._lineDash],
    });
    this.calls.push({ op: "save" });
  }

  restore() {
    const prev = this._stack.pop();
    if (prev) {
      this.filter = prev.filter;
      this.globalCompositeOperation = prev.globalCompositeOperation;
      this.globalAlpha = prev.globalAlpha;
      this.strokeStyle = prev.strokeStyle;
      this.fillStyle = prev.fillStyle;
      this.lineWidth = prev.lineWidth;
      this._lineDash = prev.lineDash;
    }
    this.calls.push({ op: "restore" });
  }

  translate(x, y) {
    this.calls.push({ op: "translate", x, y });
  }

  rotate(rad) {
    this.calls.push({ op: "rotate", rad });
  }

  scale(sx, sy) {
    this.calls.push({ op: "scale", sx, sy });
  }

  clearRect(x, y, w, h) {
    this.calls.push({ op: "clearRect", x, y, w, h });
  }

  fillRect(x, y, w, h) {
    this.calls.push({ op: "fillRect", x, y, w, h, fillStyle: this.fillStyle });
  }

  drawImage(img, ...args) {
    this.calls.push({ op: "drawImage", img, args, filter: this.filter });
  }

  putImageData(imageData, dx = 0, dy = 0) {
    const expected = this.canvas.width * this.canvas.height * 4;
    if (this._buffer.length !== expected) {
      this._buffer = new Uint8ClampedArray(expected);
    }
    if (imageData?.data && dx === 0 && dy === 0) {
      this._buffer.set(imageData.data.subarray(0, expected));
    }
    this.calls.push({
      op: "putImageData",
      width: imageData?.width,
      height: imageData?.height,
      dx,
      dy,
    });
  }

  getImageData(
    sx = 0,
    sy = 0,
    sw = this.canvas.width,
    sh = this.canvas.height,
  ) {
    this.calls.push({ op: "getImageData", sx, sy, sw, sh });
    return {
      width: sw,
      height: sh,
      data: new Uint8ClampedArray(sw * sh * 4),
    };
  }

  setLineDash(segments) {
    this._lineDash = Array.isArray(segments) ? [...segments] : [];
    this.calls.push({ op: "setLineDash", segments: this._lineDash });
  }

  strokeRect(x, y, w, h) {
    this.calls.push({
      op: "strokeRect",
      x,
      y,
      w,
      h,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineDash: [...this._lineDash],
    });
  }
}

export class FakeCanvasElement {
  constructor(width = 800, height = 600) {
    this.width = width;
    this.height = height;
    this._ctx = new FakeCanvasContext2D(this);
  }

  getContext(type) {
    if (type !== "2d") return null;
    return this._ctx;
  }

  toDataURL(mime = "image/png") {
    return `data:${mime};base64,RkFLRV9QTkdfREFUQQ==`;
  }
}
