/*globals define, WebGMEGlobal*/
/*jshint browser: true*/
/**
 * Generated by VisualizerGenerator 1.7.0 from webgme on Tue Mar 14 2017 09:54:31 GMT-0500 (Central Daylight Time).
 */

define([
    'superagent',
    'js/Constants',
    'js/Utils/GMEConcepts',
    'js/NodePropertyNames'
], function (
    superagent,
    CONSTANTS,
    GMEConcepts,
    nodePropertyNames) {

    'use strict';

    var GraphDBSearchControl;

    GraphDBSearchControl = function (options) {

        this._logger = options.logger.fork('Control');

        this._client = options.client;

        // Initialize core collections and variables
        this._widget = options.widget;

        this._currentNodeId = null;
        this._currentNodeParentId = undefined;

        this._initWidgetEventHandlers();

        this._logger.debug('ctor finished');
    };

    GraphDBSearchControl.prototype._initWidgetEventHandlers = function () {
        var self = this,
            widget = this._widget;

        widget.onNodeClick = function (id) {
            WebGMEGlobal.State.registerActiveSelection([id]);
        };

        widget.onNodeDblClick = function (id) {
            // FIXME: Load the correct territory
            WebGMEGlobal.State.registerActiveObject(id);
        };

        widget.onSearch = function (queryStr) {
            self.sendQuery(queryStr, function (err, result) {
                var res;
                if (!err) {
                    res = {
                        vertices: result.graph ? result.graph.vertices || [] : [],
                        edges: result.graph ? result.graph.edges || [] : []
                    };
                }

                widget.onSearchResult(err, res);
            });
        };
    };

    GraphDBSearchControl.prototype.sendQuery = function (query, callback) {
        var projectId = this._client.getActiveProjectId(),
            branchName = this._client.getActiveBranchName() || 'master',
            project;

        if (!projectId) {
            callback(new Error('No project open.'));
            return;
        }

        project = projectId.split('+');

        superagent.post('/routers/GraphDBQuery/' + project[0] + '/' + project[1] + '/' + branchName)
            .send({
                command: query
            })
            .end(function (err, result) {
                callback(err, result ? result.body : {});
            });
    };

    /* * * * * * * * Visualizer content update callbacks * * * * * * * */
    // One major concept here is with managing the territory. The territory
    // defines the parts of the project that the visualizer is interested in
    // (this allows the browser to then only load those relevant parts).
    GraphDBSearchControl.prototype.selectedObjectChanged = function (nodeId) {
        var desc = this._getObjectDescriptor(nodeId),
            self = this;

        self._logger.debug('activeObject nodeId \'' + nodeId + '\'');

        // Remove current territory patterns
        if (self._currentNodeId) {
            self._client.removeUI(self._territoryId);
        }

        self._currentNodeId = nodeId;
        self._currentNodeParentId = undefined;

        if (typeof self._currentNodeId === 'string') {
            // Put new node's info into territory rules
            self._selfPatterns = {};
            self._selfPatterns[nodeId] = {children: 0};  // Territory "rule"

            //self._widget.setTitle(desc.name.toUpperCase());

            if (typeof desc.parentId === 'string') {
                self.$btnModelHierarchyUp.show();
            } else {
                self.$btnModelHierarchyUp.hide();
            }

            self._currentNodeParentId = desc.parentId;

            self._territoryId = self._client.addUI(self, function (events) {
                self._eventCallback(events);
            });

            // Update the territory
            self._client.updateTerritory(self._territoryId, self._selfPatterns);

            self._selfPatterns[nodeId] = {children: 1};
            self._client.updateTerritory(self._territoryId, self._selfPatterns);
        }
    };

    // This next function retrieves the relevant node information for the widget
    GraphDBSearchControl.prototype._getObjectDescriptor = function (nodeId) {
        var node = this._client.getNode(nodeId),
            objDescriptor;
        if (node) {
            objDescriptor = {
                id: node.getId(),
                name: node.getAttribute(nodePropertyNames.Attributes.name),
                childrenIds: node.getChildrenIds(),
                parentId: node.getParentId(),
                isConnection: GMEConcepts.isConnection(nodeId)
            };
        }

        return objDescriptor;
    };

    /* * * * * * * * Node Event Handling * * * * * * * */
    GraphDBSearchControl.prototype._eventCallback = function (events) {
        var i = events ? events.length : 0,
            event;

        this._logger.debug('_eventCallback \'' + i + '\' items');

        while (i--) {
            event = events[i];
            switch (event.etype) {

            case CONSTANTS.TERRITORY_EVENT_LOAD:
                break;
            case CONSTANTS.TERRITORY_EVENT_UPDATE:
                break;
            case CONSTANTS.TERRITORY_EVENT_UNLOAD:
                break;
            default:
                break;
            }
        }

        this._logger.debug('_eventCallback \'' + events.length + '\' items - DONE');
    };

    GraphDBSearchControl.prototype._stateActiveObjectChanged = function (model, activeObjectId) {
        if (this._currentNodeId === activeObjectId) {
            // The same node selected as before - do not trigger
        } else {
            this.selectedObjectChanged(activeObjectId);
        }
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    GraphDBSearchControl.prototype.destroy = function () {
        this._detachClientEventListeners();
        this._removeToolbarItems();
    };

    GraphDBSearchControl.prototype._attachClientEventListeners = function () {
        this._detachClientEventListeners();
        WebGMEGlobal.State.on('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged, this);
    };

    GraphDBSearchControl.prototype._detachClientEventListeners = function () {
        WebGMEGlobal.State.off('change:' + CONSTANTS.STATE_ACTIVE_OBJECT, this._stateActiveObjectChanged);
    };

    GraphDBSearchControl.prototype.onActivate = function () {
        this._attachClientEventListeners();
        this._displayToolbarItems();

        if (typeof this._currentNodeId === 'string') {
            WebGMEGlobal.State.registerActiveObject(this._currentNodeId, {suppressVisualizerFromNode: true});
        }
    };

    GraphDBSearchControl.prototype.onDeactivate = function () {
        this._detachClientEventListeners();
        this._hideToolbarItems();
    };

    /* * * * * * * * * * Updating the toolbar * * * * * * * * * */
    GraphDBSearchControl.prototype._displayToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].show();
            }
        } else {
            this._initializeToolbar();
        }
    };

    GraphDBSearchControl.prototype._hideToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].hide();
            }
        }
    };

    GraphDBSearchControl.prototype._removeToolbarItems = function () {

        if (this._toolbarInitialized === true) {
            for (var i = this._toolbarItems.length; i--;) {
                this._toolbarItems[i].destroy();
            }
        }
    };

    GraphDBSearchControl.prototype._initializeToolbar = function () {
        var self = this,
            toolBar = WebGMEGlobal.Toolbar;

        this._toolbarItems = [];

        this._toolbarItems.push(toolBar.addSeparator());

        /************** Go to hierarchical parent button ****************/
        this.$btnModelHierarchyUp = toolBar.addButton({
            title: 'Go to parent',
            icon: 'glyphicon glyphicon-circle-arrow-up',
            clickFn: function (/*data*/) {
                WebGMEGlobal.State.registerActiveObject(self._currentNodeParentId);
            }
        });
        this._toolbarItems.push(this.$btnModelHierarchyUp);
        this.$btnModelHierarchyUp.hide();

        /************** Checkbox example *******************/

        this.$cbShowConnection = toolBar.addCheckBox({
            title: 'toggle checkbox',
            icon: 'gme icon-gme_diagonal-arrow',
            checkChangedFn: function (data, checked) {
                self._logger.debug('Checkbox has been clicked!');
            }
        });
        this._toolbarItems.push(this.$cbShowConnection);

        this._toolbarInitialized = true;
    };

    return GraphDBSearchControl;
});
