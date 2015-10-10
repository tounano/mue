'use strict';

module.exports = function createId() {return Math.round(Math.random() * new Date().getTime())};