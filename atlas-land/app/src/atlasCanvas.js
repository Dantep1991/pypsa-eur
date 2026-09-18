import L from 'leaflet';

// Scoped Leaflet 1.9 Canvas lifecycle fix (not a global prototype patch).
// _updatePaths can call _redraw synchronously while a RAF redraw is queued.
// Leaflet clears _redrawRequest there without cancelling that RAF, so removing
// the renderer can leave an orphan callback drawing into a destroyed context.
// Keep this small private-method extension covered against the installed
// Leaflet implementation when upgrading the map dependency.
const AtlasCanvas = L.Canvas.extend({
  options: { deferDrawing: false },
  _requestRedraw(layer) {
    if (this.options.deferDrawing) {
      // Hidden replacement buffers still project/clip each new path, but must
      // not repeatedly paint the growing graph at every construction yield.
      return;
    }
    return L.Canvas.prototype._requestRedraw.call(this, layer);
  },
  _redraw() {
    L.Util.cancelAnimFrame(this._redrawRequest);
    this._redrawRequest = null;
    if (!this._map || !this._ctx || this.options.deferDrawing) return;
    return L.Canvas.prototype._redraw.call(this);
  },
  finishDeferredDrawing() {
    if (!this.options.deferDrawing) return;
    this.options.deferDrawing = false;
    // A newly staged canvas has no previous pixels to retain. Paint its full
    // current extent, including paths added before a resize or camera update.
    this._redrawBounds = null;
    this._redraw();
  },
  discardDrawing() {
    // Every removed Leaflet path normally expands dirty bounds and requests a
    // redraw. This entire owned canvas is about to go away, so none is useful.
    this.options.deferDrawing = true;
    L.Util.cancelAnimFrame(this._redrawRequest);
    this._redrawRequest = null;
    this._redrawBounds = null;
  },
});

export const createAtlasCanvas = options => new AtlasCanvas(options);
