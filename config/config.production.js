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

validateConfig(config);
module.exports = config;
