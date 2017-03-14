/*globals define, WebGMEGlobal, $*/
/*jshint browser: true*/

/**
 * Generated by VisualizerGenerator 1.7.0 from webgme on Tue Mar 14 2017 09:54:31 GMT-0500 (Central Daylight Time).
 */

define([
    'text!./templates/GraphDBSearchWidget.html',
    'css!./styles/GraphDBSearchWidget.css'
], function (TEMPLATE) {
    'use strict';

    var GraphDBSearchWidget,
        WIDGET_CLASS = 'graph-db-search';

    GraphDBSearchWidget = function (logger, container) {
        this._logger = logger.fork('Widget');

        this._el = container;

        this.nodes = {};
        this._initialize();

        this._logger.debug('ctor finished');
    };

    GraphDBSearchWidget.prototype._initialize = function () {
        var width = this._el.width(),
            height = this._el.height(),
            self = this;

        // set widget class
        this._el.addClass(WIDGET_CLASS);

        // Create a dummy header 
        this._el.append(TEMPLATE);

        this._okBtn = this._el.find('.ok-btn');
        this._inputQuery = this._el.find('.input-query');
        this._errorBadge = this._el.find('.error-badge');
        this._resultContainer = this._el.find('.result-container');

        this._inputQuery.val("V.has('path', '/1')");

        // Registering to events can be done with jQuery (as normal)
        this._okBtn.on('click', function (event) {
            event.stopPropagation();
            event.preventDefault();
            self.onSearchClick();
        });
    };

    GraphDBSearchWidget.prototype.onWidgetContainerResize = function (width, height) {
        this._logger.debug('Widget is resizing...');
    };

    /* * * * * * * * Visualizer event handlers * * * * * * * */

    GraphDBSearchWidget.prototype.onSearchClick = function () {
        var queryStr = this._inputQuery.val();
        this._okBtn.prop('disabled', true);
        this._errorBadge.hide();
        this._resultContainer.empty();
        this.onSearch('g.' + queryStr);
    };

    /* * * * * * * * Controller callbacks * * * * * * * */

    GraphDBSearchWidget.prototype.onSearchResult = function (err, result) {
        var self = this;
        this._okBtn.prop('disabled', false);
        if (err) {
            this._errorBadge.text(err.message);
            this._errorBadge.show();
        } else {
            result.vertices.forEach(function (objDesc) {
                self.addVertex(objDesc);
            });
        }
    };

    GraphDBSearchWidget.prototype.addVertex = function (objDesc) {
        var vEl = $('<div/>', {
            class: 'vertex-result'
        });

        vEl.text(objDesc.name + '[' + objDesc.path + ']');

        this._resultContainer.append(vEl);
    };

    /* * * * * * * * Visualizer life cycle callbacks * * * * * * * */
    GraphDBSearchWidget.prototype.destroy = function () {
    };

    GraphDBSearchWidget.prototype.onActivate = function () {
        this._logger.debug('GraphDBSearchWidget has been activated');
    };

    GraphDBSearchWidget.prototype.onDeactivate = function () {
        this._logger.debug('GraphDBSearchWidget has been deactivated');
    };

    return GraphDBSearchWidget;
});
