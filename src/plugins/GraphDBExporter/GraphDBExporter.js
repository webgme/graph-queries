/*globals define*/
/*jshint node:true, browser:true*/

/**
 * Get all direct instances of the FCO
 * g.V.has('path', '/1').inE('base')
 *
 * Get all direct children of ROOT
 * g.V.has('path', '').inE('parent')
 *
 */

define([
    'plugin/PluginConfig',
    'text!./metadata.json',
    'plugin/PluginBase',
    'q',
    './maps'
], function (PluginConfig,
             pluginMetadata_,
             PluginBase,
             Q,
             maps) {
    'use strict';

    var pluginMetadata = JSON.parse(pluginMetadata_);

    /**
     * Initializes a new instance of XMIExporter.
     * @class
     * @augments {PluginBase}
     * @classdesc This class represents the plugin GraphDBExporter.
     * @constructor
     */
    var GraphDBExporter = function () {
        // Call base class' constructor.
        PluginBase.call(this);
        this.pluginMetadata = pluginMetadata;
    };

    /**
     * Metadata associated with the plugin. Contains id, name, version, description, icon, configStructue etc.
     * This is also available at the instance at this.pluginMetadata.
     * @type {object}
     */
    GraphDBExporter.metadata = pluginMetadata;

    // Prototypical inheritance from PluginBase.
    GraphDBExporter.prototype = Object.create(PluginBase.prototype);
    GraphDBExporter.prototype.constructor = GraphDBExporter;

    /**
     * Main function for the plugin to execute. This will perform the execution.
     * Notes:
     * - Always log with the provided logger.[error,warning,info,debug].
     * - Do NOT put any user interaction logic UI, etc. inside this method.
     * - callback always has to be called even if error happened.
     *
     * @param {function(string, plugin.PluginResult)} callback - the result callback
     */
    GraphDBExporter.prototype.main = function (callback) {
        var self = this,
            OrientDB = require('orientjs'),
            config = this.getCurrentConfig(),
            data,
            logger = this.logger,
            server = new OrientDB({
                host: config.host,
                port: config.port,
                username: config.username,
                password: config.password
            }),
            db;

        logger.info('Removing old previous data from graphDB...');
        this.createOrGetDatabase(server)
            .then(function (db_) {
                db = db_;
                self.db = db;
                logger.info('Getting graph info from gme-model...');
                return self.getGraphDBData(self.core, self.rootNode);
            })
            .then(function (result) {
                logger.info('Inserting nodes to graphDB...');
                data = result;
                return self.insertEntries(db, data.nodes, config);
            })
            .then(function () {
                logger.info('Inserting relations to graphDB...');
                return self.insertEntries(db, data.relations, config);
            })
            .then(function () {
                self.result.setSuccess(true);
                logger.info('Finished!');
                server.close();
                callback(null, self.result);
            })
            .catch(function (err) {
                logger.error(err.stack);
                server.close();
                callback(err, self.result);
            });
    };

    GraphDBExporter.prototype.createOrGetDatabase = function (server, forceNew) {
        var deferred = Q.defer(),
            self = this,
            dbName = maps.getDBNameFromProjectId(this.projectId, this.branchName); //TODO: commitHash and tmp

        server.create({
            type: 'graph',
            storage: 'plocal',
            name: dbName
        }).then(function (db) {
            var nodeClass;
            self.logger.info('Created new database', db.name);
            self.logger.info('Creating classes, properties and indices...');

            // Create the base-classes
            Q.all([
                db.class.create('node', 'V'),
                db.class.create('relation', 'E')
            ])
                .then(function (res) {
                    // Create properties to nodeClass.
                    nodeClass = res[0];
                    return nodeClass.property.create([
                        {
                            name: 'name',
                            type: 'String'
                        },
                        {
                            name: 'guid',
                            type: 'String'
                        },
                        {
                            name: 'path',
                            type: 'String'
                        },
                        {
                            name: 'relid',
                            type: 'String'
                        }
                    ]);
                })
                .then(function () {
                    // Create indices on node properties.
                    db.index.create({
                        name: 'node.name',
                        type: 'fulltext'
                    });

                    db.index.create({
                        name: 'node.path',
                        type: 'unique'
                    });

                    db.index.create({
                        name: 'node.guid',
                        type: 'unique'
                    });

                    // Create relation classes.
                    return Q.all([
                        db.class.create('parent', 'relation'),
                        db.class.create('base', 'relation'),
                        db.class.create('meta', 'relation'),
                        db.class.create('pointer', 'relation'),
                        db.class.create('member', 'relation'),
                        db.class.create('connection', 'relation')
                    ]);
                })
                .then(function () {
                    deferred.resolve(db);
                })
                .catch(deferred.reject);

        }).catch(function (err) {
            var db;
            if (err.message.indexOf('already exists') > -1) {
                db = server.use(dbName);
                self.logger.info('Opened existing database', db.name);
                self.logger.info('Deleting existing vertices and edges..');

                Q.all([
                    db.delete('VERTEX', 'node').where('true').scalar(),
                    db.delete('EDGE', 'relation').where('true').scalar()
                ])
                    .then(function () {
                        deferred.resolve(db);
                    })
                    .catch(deferred.reject);

            } else {
                deferred.reject(err);
            }
        });

        return deferred.promise;
    };

    GraphDBExporter.prototype.getGraphDBData = function (core, rootNode, callback) {
        var self = this,
            nodes = [],
            guids = {},
            relations = [];

        function encodeAttribute(str) {
            if (typeof str === 'string') {
                return JSON.stringify(str);
            } else {
                return str;
            }
        }

        function atNode(node, next) {
            var deferred = Q.defer(),
                parent = core.getParent(node),
                nodePath = core.getPath(node),
                metaNode = core.getBaseType(node),
                baseNode = core.getBase(node),
                guid = core.getGuid(node),
                attributes,
                connInfo = {
                    src: null,
                    dst: null
                },
                promises = [];

            attributes = core.getAttributeNames(node).map(function (attrName) {
                var dbName,
                    attrVal;

                if (maps.CONSTANTS.ILLEGAL_ATTR.indexOf(attrName) > -1) {
                    dbName = maps.CONSTANTS.PREFIX_ILLEGAL_ATTR + attrName;
                    self.logger.warn('Illegal attribute', attrName, ', mapped name:', dbName);
                } else {
                    dbName = attrName;
                }

                attrVal = core.getAttribute(node, attrName);
                return '`' + dbName + '`=' + encodeAttribute(attrVal);
            }).join(', ');

            nodes.push({
                query: [
                    'create vertex node set guid="', guid,
                    '", path="', nodePath,
                    '", relid="', core.getRelid(node),
                    '", ', attributes
                ].join(''),
                nodePath: nodePath
            });

            if (core.getPath(node) === '') {
                // It's the rootNode...
                deferred.resolve();
                return deferred.promise.nodeify(next);
            }

            // Parent relationship
            relations.push({
                query: [
                    'create edge parent from (select from node where path="', nodePath,
                    '") to (select from node where path= "', core.getPath(parent), '")'
                ].join(''),
                nodePath: nodePath
            });

            // Base relationship
            if (baseNode) {
                relations.push({
                    query: [
                        'create edge base from (select from node where path= "', nodePath,
                        '") to (select from node where path="', core.getPath(baseNode), '")'
                    ].join(''),
                    nodePath: nodePath
                });
            }

            // Meta relationship
            relations.push({
                query: [
                    'create edge meta from (select from node where path= "', nodePath,
                    '") to (select from node where path="', core.getPath(metaNode), '")'
                ].join(''),
                nodePath: nodePath
            });

            // Pointer relationships (excluding base)
            core.getPointerNames(node).forEach(function (ptrName) {
                var targetPath;

                if (ptrName !== 'base') {
                    targetPath = core.getPointerPath(node, ptrName);
                    //TODO: Should null pointers have a special target?
                    if (typeof targetPath === 'string') {
                        relations.push({
                            query: [
                                'create edge pointer from (select from node where path="', nodePath,
                                '") to (select from node where path="', targetPath,
                                '") set ptr="', ptrName, '"'
                            ].join(''),
                            nodePath: nodePath
                        });

                        if (ptrName == 'src' || ptrName === 'dst') {
                            connInfo[ptrName] = targetPath;
                        }
                    }
                }
            });

            // Add the src and dst as connections as well.
            if (connInfo.src && connInfo.dst) {
                relations.push({
                    query: [
                        'create edge connection from (select from node where path="', connInfo.src,
                        '") to (select from node where path="', connInfo.dst, '")'
                    ].join(''),
                    nodePath: nodePath
                });
            }

            core.getSetNames(node).forEach(function (setName) {
                var memberPaths = core.getMemberPaths(node, setName);
                memberPaths.forEach(function (memberPath) {
                    if (typeof memberPath === 'string') {
                        relations.push({
                            query: [
                                'create edge member from (select from node where path="', nodePath,
                                '") to (select from node where path="', memberPath,
                                '") set set="', setName, '"'
                            ].join(''),
                            nodePath: nodePath
                        });
                    }
                })
            });

            Q.all(promises)
                .then(deferred.resolve)
                .catch(deferred.reject);

            return deferred.promise.nodeify(next);
        }

        return core.traverse(rootNode, {excludeRoot: false, stopOnError: true}, atNode)
            .then(function () {
                return {
                    nodes: nodes,
                    relations: relations
                }
            })
            .nodeify(callback);
    };

    GraphDBExporter.prototype.insertEntries = function (db, entries, config) {
        var self = this,
            entArrays = [],
            nbrOfbatches = 0,
            cnt = 0;

        function insertBatch() {
            var batchEntries = entArrays[cnt];

            return Q.allSettled(batchEntries.map(function (entry) {
                return db.query(entry.query);
            }))
                .then(function (res) {
                    var errors = [],
                        i;

                    // One more batch was handled.
                    cnt += 1;

                    // Gather all errors.
                    for (i = 0; i < res.length; i += 1) {
                        if (res[i].state !== 'fulfilled') {
                            errors.push({
                                err: res[i].reason,
                                node: batchEntries[i].nodePath,
                                query: batchEntries[i].query
                            });
                        }
                    }

                    if (errors.length > 0) {
                        self.logger.error('Got', errors.length, 'insertion errors in batch - execution stopped.');
                        Q.all(errors.map(function (error) {
                            return self.core.loadByPath(self.rootNode, error.nodePath)
                                .then(function (node) {
                                    self.createMessage(node, error.err.message, 'error');
                                });
                        }))
                            .then(function () {
                                throw new Error('Errors during insertion, see messages');
                            });

                    } else if (cnt >= nbrOfbatches) {
                        return Q();
                    } else {
                        self.logger.info('Done with batch [', cnt, '/', nbrOfbatches, ']');
                        return insertBatch();
                    }
                });
        }

        while (entries.length > 0) {
            entArrays.push(entries.splice(0, config.batchSize));
            nbrOfbatches += 1;
        }

        self.logger.info('Inserting as', nbrOfbatches, 'batch(es).');
        if (nbrOfbatches > 0) {
            return insertBatch();
        } else {
            return Q();
        }
    };

    return GraphDBExporter;
});