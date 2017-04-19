/*jshint node: true*/
/**
 * @author pmeijer / https://github.com/pmeijer
 */

'use strict';

var config = require('./config.default'),
    path = require('path'),
    validateConfig = require('webgme/config/validator');

config.server.port = process.env.PORT ? parseInt(process.env.PORT, 10) : 8000;
config.authentication.enable = true;
config.authentication.jwt.privateKey = path.join(__dirname, '..', '..', 'token_keys', 'private_key');
config.authentication.jwt.publicKey = path.join(__dirname, '..', '..', 'token_keys', 'public_key');

config.socketIO.adapter.type = 'redis';
config.socketIO.adapter.options.uri = '127.0.0.1:6379';

config.blob.fsDir = '../blob-local-storage';

config.addOn.enable = true;
config.addOn.workerUrl = 'http://127.0.0.1:8080';

validateConfig(config);
module.exports = config;
