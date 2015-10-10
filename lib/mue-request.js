'use strict';

var through   = require('through2');

function MueRequest(onRequest, onMessage, spoke, cb) {
  var s             = through.obj()
    , args          = Array.prototype.slice.call(arguments)
    , cb            = args.slice(-1)[0]
    , ended         = false
    , requestSent   = false
    , responseSent  = false
    ;


  s.on('data', _onData)
  spoke.pipe(s, {end: false});

  process.nextTick(function () {
    if (requestSent) return;
    requestSent = true;
    !ended && spoke.write(onRequest.apply(null, [_cb].concat(args.slice(3,-1))));
  });

  function _onData(msg) {
    if (!requestSent && responseSent) return;
    process.nextTick(function () {
      onMessage.apply(null, [msg, _cb].concat(args.slice(3,-1)));
    })
  }

  function _cb() {
    if (responseSent) return;
    var args = arguments;
    responseSent = true;
    ended = true;

    process.nextTick(function () {
      s.end();
      cb.apply(null, args);
    });
  }
}

module.exports = MueRequest;