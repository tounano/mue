'use strict';

var createId  = require('./create-id')
  , assign    = require('xtend/mutable')
  ;

function Spoke(hub, spokeStream) {
  var spoke = {
    id: createId(),
    type: 'Spoke',
    hub: hub,
    stream: spokeStream
  };

  return assign(spoke,{
    _onSpokeData: _onSpokeData.bind(spoke.stream, spoke),
    _onSpokeError: _onSpokeError.bind(spoke.stream, spoke),
    _onSpokeClose: _onSpokeClose.bind(spoke.stream, spoke),
    _connectToHub: _connectToHub.bind(spoke.stream, spoke),
    _disconnectFromHub: _disconnectFromHub.bind(spoke.stream, spoke)
  });
}

function _onSpokeData(spoke, msg) {
  spoke.hub._receiveMessageFromSpoke(spoke, msg)
  return spoke;
}

function _onSpokeError(spoke, err) {
  spoke.hub._receiveSpokeError(spoke, err);
  return spoke;
}

function _onSpokeClose(spoke) {
  spoke.hub._receiveSpokeCloseEvent(spoke);
  return spoke;
}

function _connectToHub(spoke) {
  spoke.stream
    .on('data', spoke._onSpokeData)
    .on('error', spoke._onSpokeError)
    .on('end', spoke._onSpokeClose)
    .on('close', spoke._onSpokeClose)
    .on('destroy', spoke._onSpokeClose)
  ;
  return spoke;
}

function _disconnectFromHub(spoke) {
  spoke.stream
    .removeListener('data', spoke._onSpokeData)
    .removeListener('error', spoke._onSpokeError)
    .removeListener('end', spoke._onSpokeClose)
    .removeListener('close', spoke._onSpokeClose)
    .removeListener('destroy', spoke._onSpokeClose)
  ;
  return spoke;
}

module.exports = Spoke;