/*globals define*/
/*jshint node:true*/

/**
 * Generated by RestRouterGenerator 2.2.0 from webgme on Tue Feb 21 2017 15:51:05 GMT-0600 (Central Standard Time).
 * To use in webgme add to gmeConfig.rest.components[<routePath>] = filePath.
 *
 * If you put this file in the root of your directory the following config,
 * gmeConfig.rest.component['path/subPath'] = path.join(process.cwd(), './GraphDBQuery')
 * will expose, e.g. GET <host>/path/subPath/getExample, when running the server.
 */

'use strict';

// http://expressjs.com/en/guide/routing.html
var express = require('express'),
    router = express.Router(),
    Query = require('./query');

/**
 * Called when the server is created but before it starts to listening to incoming requests.
 * N.B. gmeAuth, safeStorage and workerManager are not ready to use until the start function is called.
 * (However inside an incoming request they are all ensured to have been initialized.)
 *
 * @param {object} middlewareOpts - Passed by the webgme server.
 * @param {GmeConfig} middlewareOpts.gmeConfig - GME config parameters.
 * @param {GmeLogger} middlewareOpts.logger - logger
 * @param {function} middlewareOpts.ensureAuthenticated - Ensures the user is authenticated.
 * @param {function} middlewareOpts.getUserId - If authenticated retrieves the userId from the request.
 * @param {object} middlewareOpts.gmeAuth - Authorization module.
 * @param {object} middlewareOpts.safeStorage - Accesses the storage and emits events (PROJECT_CREATED, COMMIT..).
 * @param {object} middlewareOpts.workerManager - Spawns and keeps track of "worker" sub-processes.
 */
function initialize(middlewareOpts) {
    var logger = middlewareOpts.logger.fork('GraphDBQuery'),
        ensureAuthenticated = middlewareOpts.ensureAuthenticated,
        getUserId = middlewareOpts.getUserId,
        query = new Query('http://localhost:2480', 'root', 'resan'); // TODO: Use a read only user.

    logger.debug('initializing ...');

    // Ensure authenticated can be used only after this rule.
    router.use('*', function (req, res, next) {
        // TODO: set all headers, check rate limit, etc.

        // This header ensures that any failures with authentication won't redirect.
        res.setHeader('X-WebGME-Media-Type', 'webgme.v1');
        next();
    });

    // Use ensureAuthenticated if the routes require authentication. (Can be set explicitly for each route.)
    router.use('*', ensureAuthenticated);

    router.get('/getExample', function (req, res/*, next*/) {
        var userId = getUserId(req);

        res.json({userId: userId, message: 'get request was handled'});
    });

    router.post('/:ownerId/:projectName/:branchOrCommitHash', function (req, res, next) {
        var userId = getUserId(req);
        // TODO: Ensure user is authorized.

        query.sendCommand(req.params.ownerId, req.params.projectName, req.params.branchOrCommitHash, req.body)
            .then(function (result) {
                res.json(result);
            })
            .catch(function (err) {
                logger.error('command failed:', req.body);
                logger.error(err);
                next(err);
            });
    });

    logger.debug('ready');
}

/**
 * Called before the server starts listening.
 * @param {function} callback
 */
function start(callback) {
    callback();
}

/**
 * Called after the server stopped listening.
 * @param {function} callback
 */
function stop(callback) {
    callback();
}


module.exports = {
    initialize: initialize,
    router: router,
    start: start,
    stop: stop
};
