'use strict';

var through   = require('through2')
  , dup       = require('duplexify')
  ;

function Plug(stream) {
  var incoming = through.obj(function (msg, enc, cb) {
    msg._skip = true;
    this.push(msg);
    cb();
  });

  var outgoing = through.obj(function (msg, enc, cb) {
    if (msg._skip) return cb();
    this.push(msg);
    cb();
  });

  return dup.obj(incoming, incoming.pipe(stream).pipe(outgoing));
}

module.exports = Plug;