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
    'q'
], function (PluginConfig,
             pluginMetadata_,
             PluginBase,
             Q) {
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
        // Use self to access core, project, result, logger etc from PluginBase.
        // These are all instantiated at this point.
        var self = this,
            ODatabase = require('orientjs').ODatabase,
            data,
            logger = this.logger,
        // FIXME: This should create a new database!
            db = new ODatabase({
                host: 'localhost',
                port: 2424,
                username: 'root',
                password: 'resan',
                name: 'TEST'
            });

        logger.info('Deleting nodes and relations from graphDB...');

        Q.allSettled([
            db.delete('VERTEX', 'node').where('true').scalar(),
            db.delete('EDGE', 'relation').where('true').scalar()
        ])
            .then(function () {
                logger.info('Creating new classes and indices...');
                return Q.allSettled([
                    db.class.create('node', 'V'),
                    db.class.create('relation', 'E')
                ]);
            })
            .then(function () {
                return Q.allSettled([
                    db.class.create('parent', 'relation'),
                    db.class.create('base', 'relation'),
                    db.class.create('meta', 'relation'),
                    db.class.create('pointer', 'relation'),
                    db.class.create('member', 'relation'),
                    db.class.create('connection', 'relation')
                ]);
            })
            .then(function () {
                return Q.allSettled([
                    db.query('create property node.name string'),
                    db.query('create property node.guid string'),
                    db.query('create property node.path string'),
                    db.query('create property node.relid string'),

                    db.query('CREATE INDEX name_idx ON node (name) FULLTEXT'),
                    db.query('CREATE INDEX guid_idx ON node (guid) UNIQUE'),
                    db.query('CREATE INDEX path_idx ON node (path) UNIQUE')
                ]);
            })
            .then(function () {
                logger.info('Getting graph info from gme-model...');
                return self.getGraphDBData(self.core, self.rootNode);
            })
            .then(function (result) {
                data = result;
                // FIXME: Some sort of throttling or batched inserts should be done when inserting.

                logger.info('Adding nodes to graphDB...');
                return Q.all(data.nodes.map(function (node) {
                    console.log(node);
                    return db.query(node);
                }));
            })
            .then(function () {

                logger.info('Adding relations to graphDB...');
                return Q.all(data.relations.map(function (rel) {
                    console.log(rel);
                    return db.query(rel);
                }));
            })
            .then(function () {
                self.result.setSuccess(true);
                logger.info('Finished!');
                callback(null, self.result);
            })
            .catch(function (err) {
                logger.error(err.stack);
                callback(err, self.result);
            });
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
                //FIXME: What are the reserved keywords and how should they be dealt with??
                if (attrName === 'limit') {
                    attrName = 'limitlimit';
                }
                return attrName + '="' + core.getAttribute(node, attrName) + '"';
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
                    relations.push([
                        'create edge pointer from (select from node where path="',
                        core.getPath(node),
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

            // TODO: Deal with sets!
            core.getSetNames(node).forEach(function (setName) {
                var memberPaths = core.getMemberPaths(node, setName);
                memberPaths.forEach(function (memberPath) {
                    promises.push(
                        core.loadByPath(rootNode, memberPath)
                            .then(function (memberNode) {
                                var memberMetaNode = core.getBaseType(memberNode),
                                    memberMetaName = core.getAttribute(memberMetaNode, 'name');
                            })
                    );
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