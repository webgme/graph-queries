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

        logger.info('Deleting nodes and relations from graphDB...');
        this.createOrGetDatabase(server)
            .then(function (db_) {
                db = db_;
                self.db = db;
                logger.info('Getting graph info from gme-model...');
                return self.getGraphDBData(self.core, self.rootNode);
            })
            .then(function (result) {
                data = result;
                // FIXME: Some sort of throttling or batched inserts should be done when inserting.

                logger.info('Adding nodes to graphDB...');
                return Q.all(data.nodes.map(function (node) {
                    self.logger.debug(node);
                    return db.query(node);
                }));
            })
            .then(function () {

                logger.info('Adding relations to graphDB...');
                return Q.all(data.relations.map(function (rel) {
                    self.logger.debug(rel);
                    return db.query(rel);
                }));
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
            self = this;

        server.create({
            type: 'graph',
            storage: 'plocal',
            name: maps.getDBNameFromProjectId(this.projectId, this.branchName) //TODO: commitHash and tmp
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
                db = server.use(self.projectName);
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
        var rootAttrs,
            nodes = [],
            relations = [];

        rootAttrs = core.getAttributeNames(rootNode).map(function (attrName) {
            //FIXME: What are the reserved keywords and how should they be dealt with??
            if (attrName === 'limit') {
                attrName = 'limitlimit';
            }
            return attrName + '="' + core.getAttribute(rootNode, attrName) + '"';
        }).join(', ');

        nodes.push([
            'create vertex node set guid="',
            core.getGuid(rootNode),
            '", path="", relid="", ',
            rootAttrs
        ].join(''));

        function atNode(node, next) {
            var deferred = Q.defer(),
                parent = core.getParent(node),
                nodePath = core.getPath(node),
                metaNode = core.getBaseType(node),
                baseNode = core.getBase(node),
                attributes,
                connInfo = {
                    src: null,
                    dst: null
                },
                promises = [];

            attributes = core.getAttributeNames(node).map(function (attrName) {
                var dbName;

                if (maps.CONSTANTS.ILLEGAL_ATTR.indexOf(attrName) > -1) {
                    dbName = maps.CONSTANTS.PREFIX_ILLEGAL_ATTR + attrName;
                    logger.warn('illegal attribute', attrName, ', mapped name:', dbName);
                } else {
                    dbName = attrName;
                }

                return dbName + '="' + core.getAttribute(node, attrName) + '"';
            }).join(', ');

            // Add the node.
            nodes.push([
                'create vertex node set guid="',
                core.getGuid(node),
                '", path="',
                nodePath,
                '", relid="',
                core.getRelid(node),
                '", ',
                attributes
            ].join(''));

            // Parent relationship
            relations.push([
                'create edge parent from (select from node where path="',
                nodePath,
                '") to (select from node where path= "',
                core.getPath(parent),
                '")'
            ].join(''));

            // Base relationship
            if (baseNode) {
                relations.push([
                    'create edge base from (select from node where path= "',
                    nodePath,
                    '") to (select from node where path="',
                    core.getPath(baseNode),
                    '")'
                ].join(''));
            }

            // Meta relationship
            relations.push([
                'create edge meta from (select from node where path= "',
                nodePath,
                '") to (select from node where path="',
                core.getPath(metaNode),
                '")'
            ].join(''));

            // Pointer relationships (excluding base)
            core.getPointerNames(node).forEach(function (ptrName) {
                var targetPath;

                if (ptrName !== 'base') {
                    targetPath = core.getPointerPath(node, ptrName);
                    //TODO: Should null pointers have a special target?
                    if (typeof targetPath === 'string') {
                        relations.push([
                            'create edge pointer from (select from node where path="',
                            nodePath,
                            '") to (select from node where path="',
                            targetPath,
                            '") set ptr="',
                            ptrName,
                            '"'
                        ].join(''));

                        if (ptrName == 'src' || ptrName === 'dst') {
                            connInfo[ptrName] = targetPath;
                        }
                    }
                }
            });

            // Add the src and dst as connections as well.
            if (connInfo.src && connInfo.dst) {
                relations.push([
                    'create edge connection from (select from node where path="',
                    connInfo.src,
                    '") to (select from node where path="',
                    connInfo.dst,
                    '")'
                ].join(''));
            }

            core.getSetNames(node).forEach(function (setName) {
                var memberPaths = core.getMemberPaths(node, setName);
                memberPaths.forEach(function (memberPath) {
                    if (typeof memberPath === 'string') {
                        relations.push([
                            'create edge member from (select from node where path="',
                            nodePath,
                            '") to (select from node where path="',
                            memberPath,
                            '") set set="',
                            setName,
                            '"'
                        ].join(''));
                    }
                })
            });

            Q.all(promises)
                .then(deferred.resolve)
                .catch(deferred.reject);

            return deferred.promise.nodeify(next);
        }

        return core.traverse(rootNode, {excludeRoot: true, stopOnError: true}, atNode)
            .then(function () {
                return {
                    nodes: nodes,
                    relations: relations
                }
            })
            .nodeify(callback);
    };

    return GraphDBExporter;
});