'use strict';

var assign        = require('xtend/mutable')
  , dup           = require('duplexify')
  , through       = require('through2')
  , selectors     = require('selectors')
  , setSelection  = selectors.setSelection
  , select        = selectors.select
  , Spoke      = require('./spoke')
  ;

function isPipeable(x) {return x &&!!x.pipe}


function Mue(opts, spoke) {
  var options   = !isPipeable(opts)? opts : {}
    , spokes    = Array.prototype.slice.call(arguments, isPipeable(opts)? 0 : 1)
    , incoming  = through(options)
    , outgoing  = through(options)
    ;

  return assign(dup(incoming, outgoing, options),{
    _ctor: function (opts, state) {
      state.incoming.on('data', this._receiveIncomingMessage.bind(this));

      (state.spokes || []).reduce(function (hub, stream) {
        hub._addStream(stream);
        return hub;
      }, this);

      return this;
    },
    _incoming: incoming,
    _outgoing: outgoing,
    _getSpokes: function () {
      return this._spokes || [];
    },
    _addStream: function (stream) {
      return this._addSpoke(Spoke(this, stream));
    },
    _addSpoke: function (spoke) {
      this._registerSpoke(spoke);
      return spoke._connectToHub();
    },
    _registerSpoke: function (spoke) {
      this._spokes = this._getSpokes().concat([spoke]);
      return this;
    },
    _unregisterSpoke: function (spoke) {
      this._spokes = this._getSpokes().filter(function (spokeToUnregister) {
        return spoke.id !== spokeToUnregister.id;
      });
      return this;
    },
    _receiveIncomingMessage: function (msg) {
      this._getSpokes()
        .map(select('stream'))
        .reduce(_writeMessage, msg)
      ;
      return this;
    },
    _receiveMessageFromSpoke: function (spoke, msg) {
      [this._outgoing].concat(this._getSpokes()
        .filter(function (currentSpoke) {
          return currentSpoke.id !== spoke.id;
        })
        .map(select('stream')))
        .reduce(_writeMessage, msg)
      ;
      return this;
    },
    _receiveSpokeError: function (spoke, err) {

    },
    _receiveSpokeCloseEvent: function (spoke) {
      return this._unregisterSpoke(
        spoke._disconnectFromHub()
      );
    }
  })._ctor(options, {incoming: incoming, outgoing: outgoing, spokes: spokes});
}

function _writeMessage(msg, stream) {
  stream.write(msg);
  return msg;
}

module.exports = Mue;