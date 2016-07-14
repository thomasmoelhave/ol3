goog.provide('ol.source.TileImage');

goog.require('ol.ImageTile');
goog.require('ol.TileCache');
goog.require('ol.TileState');
goog.require('ol.events');
goog.require('ol.events.EventType');
goog.require('ol.proj');
goog.require('ol.reproj.Tile');
goog.require('ol.source.UrlTile');


/**
 * @classdesc
 * Base class for sources providing images divided into a tile grid.
 *
 * @constructor
 * @fires ol.source.TileEvent
 * @extends {ol.source.UrlTile}
 * @param {olx.source.TileImageOptions} options Image tile options.
 * @api
 */
ol.source.TileImage = function(options) {

  ol.source.UrlTile.call(this, {
    attributions: options.attributions,
    cacheSize: options.cacheSize,
    extent: options.extent,
    logo: options.logo,
    opaque: options.opaque,
    projection: options.projection,
    state: options.state,
    tileGrid: options.tileGrid,
    tileLoadFunction: options.tileLoadFunction ?
        options.tileLoadFunction : ol.source.TileImage.defaultTileLoadFunction,
    tilePixelRatio: options.tilePixelRatio,
    tileUrlFunction: options.tileUrlFunction,
    url: options.url,
    urls: options.urls,
    wrapX: options.wrapX
  });

  /**
   * @protected
   * @type {?string}
   */
  this.crossOrigin =
      options.crossOrigin !== undefined ? options.crossOrigin : null;

  /**
   * @protected
   * @type {function(new: ol.ImageTile, ol.TileCoord, ol.TileState, string,
   *        ?string, ol.TileLoadFunctionType)}
   */
  this.tileClass = options.tileClass !== undefined ?
      options.tileClass : ol.ImageTile;

  /**
   * @protected
   * @type {Object.<string, ol.TileCache>}
   */
  this.tileCacheForProjection = {};

  /**
   * @protected
   * @type {Object.<string, ol.tilegrid.TileGrid>}
   */
  this.tileGridForProjection = {};

  /**
   * @private
   * @type {number|undefined}
   */
  this.reprojectionErrorThreshold_ = options.reprojectionErrorThreshold;

  /**
   * @private
   * @type {boolean}
   */
  this.renderReprojectionEdges_ = false;
};
ol.inherits(ol.source.TileImage, ol.source.UrlTile);


/**
 * @inheritDoc
 */
ol.source.TileImage.prototype.canExpireCache = function() {
  if (!ol.ENABLE_RASTER_REPROJECTION) {
    return ol.source.UrlTile.prototype.canExpireCache.call(this);
  }
  if (this.tileCache.canExpireCache()) {
    return true;
  } else {
    for (var key in this.tileCacheForProjection) {
      if (this.tileCacheForProjection[key].canExpireCache()) {
        return true;
      }
    }
  }
  return false;
};


/**
 * @inheritDoc
 */
ol.source.TileImage.prototype.expireCache = function(projection, usedTiles) {
  if (!ol.ENABLE_RASTER_REPROJECTION) {
    ol.source.UrlTile.prototype.expireCache.call(this, projection, usedTiles);
    return;
  }
  var usedTileCache = this.getTileCacheForProjection(projection);

  this.tileCache.expireCache(this.tileCache == usedTileCache ? usedTiles : {});
  for (var id in this.tileCacheForProjection) {
    var tileCache = this.tileCacheForProjection[id];
    tileCache.expireCache(tileCache == usedTileCache ? usedTiles : {});
  }
};


/**
 * @inheritDoc
 */
ol.source.TileImage.prototype.getGutter = function(projection) {
  if (ol.ENABLE_RASTER_REPROJECTION &&
      this.getProjection() && projection &&
      !ol.proj.equivalent(this.getProjection(), projection)) {
    return 0;
  } else {
    return this.getGutterInternal();
  }
};


/**
 * @protected
 * @return {number} Gutter.
 */
ol.source.TileImage.prototype.getGutterInternal = function() {
  return 0;
};


/**
 * @inheritDoc
 */
ol.source.TileImage.prototype.getOpaque = function(projection) {
  if (ol.ENABLE_RASTER_REPROJECTION &&
      this.getProjection() && projection &&
      !ol.proj.equivalent(this.getProjection(), projection)) {
    return false;
  } else {
    return ol.source.UrlTile.prototype.getOpaque.call(this, projection);
  }
};


/**
 * @inheritDoc
 */
ol.source.TileImage.prototype.getTileGridForProjection = function(projection) {
  if (!ol.ENABLE_RASTER_REPROJECTION) {
    return ol.source.UrlTile.prototype.getTileGridForProjection.call(this, projection);
  }
  var thisProj = this.getProjection();
  if (this.tileGrid &&
      (!thisProj || ol.proj.equivalent(thisProj, projection))) {
    return this.tileGrid;
  } else {
    var projKey = ol.getUid(projection).toString();
    if (!(projKey in this.tileGridForProjection)) {
      this.tileGridForProjection[projKey] =
          ol.tilegrid.getForProjection(projection);
    }
    return /** @type {!ol.tilegrid.TileGrid} */ (this.tileGridForProjection[projKey]);
  }
};


/**
 * @inheritDoc
 */
ol.source.TileImage.prototype.getTileCacheForProjection = function(projection) {
  if (!ol.ENABLE_RASTER_REPROJECTION) {
    return ol.source.UrlTile.prototype.getTileCacheForProjection.call(this, projection);
  }
  var thisProj = this.getProjection();
  if (!thisProj || ol.proj.equivalent(thisProj, projection)) {
    return this.tileCache;
  } else {
    var projKey = ol.getUid(projection).toString();
    if (!(projKey in this.tileCacheForProjection)) {
      this.tileCacheForProjection[projKey] = new ol.TileCache();
    }
    return this.tileCacheForProjection[projKey];
  }
};


/**
 * @param {number} z Tile coordinate z.
 * @param {number} x Tile coordinate x.
 * @param {number} y Tile coordinate y.
 * @param {number} pixelRatio Pixel ratio.
 * @param {ol.proj.Projection} projection Projection.
 * @param {string} key The key set on the tile.
 * @return {!ol.Tile} Tile.
 * @private
 */
ol.source.TileImage.prototype.createTile_ = function(z, x, y, pixelRatio, projection, key) {
  var tileCoord = [z, x, y];
  var urlTileCoord = this.getTileCoordForTileUrlFunction(
      tileCoord, projection);
  var tileUrl = urlTileCoord ?
      this.tileUrlFunction(urlTileCoord, pixelRatio, projection) : undefined;
  var tile = new this.tileClass(
      tileCoord,
      tileUrl !== undefined ? ol.TileState.IDLE : ol.TileState.EMPTY,
      tileUrl !== undefined ? tileUrl : '',
      this.crossOrigin,
      this.tileLoadFunction);
  tile.key = key;
  ol.events.listen(tile, ol.events.EventType.CHANGE,
      this.handleTileChange, this);
  return tile;
};


/**
 * @inheritDoc
 */
ol.source.TileImage.prototype.getTile = function(z, x, y, pixelRatio, projection) {
  if (!ol.ENABLE_RASTER_REPROJECTION ||
      !this.getProjection() ||
      !projection ||
      ol.proj.equivalent(this.getProjection(), projection)) {
    return this.getTileInternal(z, x, y, pixelRatio, /** @type {!ol.proj.Projection} */ (projection));
  } else {
    var cache = this.getTileCacheForProjection(projection);
    var tileCoord = [z, x, y];
    var tile;
    var tileCoordKey = this.getKeyZXY.apply(this, tileCoord);
    if (cache.containsKey(tileCoordKey)) {
      tile = /** @type {!ol.Tile} */ (cache.get(tileCoordKey));
    }
    var key = this.getKey();
    if (tile && tile.key == key) {
      return tile;
    } else {
      var sourceProjection = /** @type {!ol.proj.Projection} */ (this.getProjection());
      var sourceTileGrid = this.getTileGridForProjection(sourceProjection);
      var targetTileGrid = this.getTileGridForProjection(projection);
      var wrappedTileCoord =
          this.getTileCoordForTileUrlFunction(tileCoord, projection);
      var newTile = new ol.reproj.Tile(
          sourceProjection, sourceTileGrid,
          projection, targetTileGrid,
          tileCoord, wrappedTileCoord, this.getTilePixelRatio(pixelRatio),
          this.getGutterInternal(),
          function(z, x, y, pixelRatio) {
            return this.getTileInternal(z, x, y, pixelRatio, sourceProjection);
          }.bind(this), this.reprojectionErrorThreshold_,
          this.renderReprojectionEdges_);
      newTile.key = key;

      if (tile) {
        newTile.interimTile = tile;
        cache.replace(tileCoordKey, newTile);
      } else {
        cache.set(tileCoordKey, newTile);
      }
      return newTile;
    }
  }
};

/**
 * @inheritDoc
 */
ol.source.TileImage.prototype.getInterimTile = function(head) {
  var /** @type {ol.Tile} */ tile = head;
  if (!head.interimTile) {
    //empty chain
    return head;
  }
  tile = head.interimTile;

  //find the first loaded tile and return it. Since the chain is sorted in decreasing
  //sequence number, this is also the newest loaded tile.
  do {
    if (tile.getState() == ol.TileState.LOADED) {
      return /** @type {!ol.Tile} */ (tile);
    }
    tile = /** @type {ol.Tile} */ (tile.interimTile);
  } while (tile);

  //we found no loaded tile, just return the head again
  return head;
};

/**
 * Goes through the chain of interim tiles starting at the provided tile and discards
 * sections of the chain that are no longer relevant.
 * @param {ol.Tile} tile Head of chain of interim tiles.
 * @return {void}
 */
ol.source.TileImage.prototype.refreshInterimChain = function(tile) {
  var /** @type {ol.Tile} */ head = tile;

  if (!head.interimTile) {
    return;
  }

  tile = head.interimTile;
  var prev = head;

  var discard = function(prev, tile) {
    prev.interimTile = tile.interimTile;
    return prev;
  };
  var step = function(prev,tile) {
    return tile;
  };

  do {
    goog.DEBUG && console.assert(tile.getSequenceNumber() < prev.getSequenceNumber(), 'Incorrect order of interim tiles.');

    if (tile.getState() == ol.TileState.LOADED) {
      //we have a loaded tile, we can discard the rest of the list
      //TODO: in an ideal world we would could abort any LOADING tile request
      //with a sequence number lower that of this tile (e.g. any loading
      //tile following this entry in the chain)
      tile.interimTile = null;
      break;
    } else if (tile.getState() == ol.TileState.LOADING) {
      //keep this LOADING tile any loaded tiles later in the chain are
      //older than this tile (lower seq num), so we're still interested in the request
      prev = step(prev,tile);
    } else if (tile.getState() == ol.TileState.IDLE) {
      //the head of the list is the most current tile, we don't need
      //to start any other requests for this chain
      prev = discard(prev,tile);
    } else {
      prev = step(prev,tile);
    }
    tile = prev.interimTile;
  } while (tile);
};

/**
 * @param {number} z Tile coordinate z.
 * @param {number} x Tile coordinate x.
 * @param {number} y Tile coordinate y.
 * @param {number} pixelRatio Pixel ratio.
 * @param {!ol.proj.Projection} projection Projection.
 * @return {!ol.Tile} Tile.
 * @protected
 */
ol.source.TileImage.prototype.getTileInternal = function(z, x, y, pixelRatio, projection) {
  var tile = null;
  var tileCoordKey = this.getKeyZXY(z, x, y);
  var key = this.getKey();
  if (!this.tileCache.containsKey(tileCoordKey)) {
    tile = this.createTile_(z, x, y, pixelRatio, projection, key);
    this.tileCache.set(tileCoordKey, tile);
  } else {
    tile = /** @type {!ol.Tile} */ (this.tileCache.get(tileCoordKey));
    if (tile.key != key) {
      // The source's params changed. If the tile has an interim tile and if we
      // can use it then we use it. Otherwise we create a new tile.  In both
      // cases we attempt to assign an interim tile to the new tile.
      var /** @type {ol.Tile} */ interimTile = tile;
      tile = this.createTile_(z, x, y, pixelRatio, projection, key);

      //make the new tile the head of the list,
      if (interimTile.getState() == ol.TileState.IDLE) {
        //the old tile hasn't begun loading yet, and is not outdated, so we can simply discard it
        tile.interimTile = interimTile.interimTile;
      } else {
        tile.interimTile = interimTile;
      }
      this.refreshInterimChain(tile);
      this.tileCache.replace(tileCoordKey, tile);
    }
  }
  return tile;
};


/**
 * Sets whether to render reprojection edges or not (usually for debugging).
 * @param {boolean} render Render the edges.
 * @api
 */
ol.source.TileImage.prototype.setRenderReprojectionEdges = function(render) {
  if (!ol.ENABLE_RASTER_REPROJECTION ||
      this.renderReprojectionEdges_ == render) {
    return;
  }
  this.renderReprojectionEdges_ = render;
  for (var id in this.tileCacheForProjection) {
    this.tileCacheForProjection[id].clear();
  }
  this.changed();
};


/**
 * Sets the tile grid to use when reprojecting the tiles to the given
 * projection instead of the default tile grid for the projection.
 *
 * This can be useful when the default tile grid cannot be created
 * (e.g. projection has no extent defined) or
 * for optimization reasons (custom tile size, resolutions, ...).
 *
 * @param {ol.ProjectionLike} projection Projection.
 * @param {ol.tilegrid.TileGrid} tilegrid Tile grid to use for the projection.
 * @api
 */
ol.source.TileImage.prototype.setTileGridForProjection = function(projection, tilegrid) {
  if (ol.ENABLE_RASTER_REPROJECTION) {
    var proj = ol.proj.get(projection);
    if (proj) {
      var projKey = ol.getUid(proj).toString();
      if (!(projKey in this.tileGridForProjection)) {
        this.tileGridForProjection[projKey] = tilegrid;
      }
    }
  }
};


/**
 * @param {ol.ImageTile} imageTile Image tile.
 * @param {string} src Source.
 */
ol.source.TileImage.defaultTileLoadFunction = function(imageTile, src) {
  imageTile.getImage().src = src;
};
